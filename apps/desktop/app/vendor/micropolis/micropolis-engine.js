/*!
 * Micropolis engine bundle for AI System 6.
 * Built from micropolisJS (https://github.com/graememcc/micropolisJS)
 * at commit f13a1624d111d235e804bd80f48ba7c9f66a8e0f, engine modules only (no upstream UI).
 * micropolisJS is adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * See LICENSE, COPYING, and NOTICE.md in this directory.
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis
 * (https://www.micropolis.com) GmbH (Micropolis Corporation, the "licensor")
 * and is licensed here to the authors/publishers of the "Micropolis" city
 * simulation game and its source code (the project or "licensee(s)") as a
 * courtesy of the owner.
 */
var MicropolisEngine = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // tooling/vendor/micropolis-engine-entry.mjs
  var micropolis_engine_entry_exports = {};
  __export(micropolis_engine_entry_exports, {
    AnimationManager: () => AnimationManager,
    BaseTool: () => BaseTool,
    EventEmitter: () => EventEmitter,
    GameCanvas: () => GameCanvas,
    GameMap: () => GameMap,
    MapGenerator: () => MapGenerator,
    Messages: () => messages_exports,
    Random: () => Random,
    Simulation: () => Simulation,
    TileSet: () => TileSet,
    TileValues: () => tileValues_exports,
    createTools: () => createTools
  });

  // external/micropolisjs/src/tileFlags.ts
  var NOFLAGS = 0;
  var POWERBIT = 32768;
  var CONDBIT = 16384;
  var BURNBIT = 8192;
  var BULLBIT = 4096;
  var ANIMBIT = 2048;
  var ZONEBIT = 1024;
  var BLBNBIT = BULLBIT | BURNBIT;
  var BLBNCNBIT = BULLBIT | BURNBIT | CONDBIT;
  var BNCNBIT = BURNBIT | CONDBIT;
  var ASCBIT = ANIMBIT | CONDBIT | BURNBIT;
  var ALLBITS = POWERBIT | CONDBIT | BURNBIT | BULLBIT | ANIMBIT | ZONEBIT;
  var BIT_START = 1024;
  var BIT_MASK = BIT_START - 1;

  // external/micropolisjs/src/tileHistory.js
  function TileHistory() {
    this.clear();
  }
  var toKey = function(x, y) {
    return [x, y].join(",");
  };
  TileHistory.prototype.clear = function() {
    this.data = {};
  };
  TileHistory.prototype.getTile = function(x, y) {
    var key = toKey(x, y);
    return this.data[key];
  };
  TileHistory.prototype.setTile = function(x, y, value) {
    var key = toKey(x, y);
    this.data[key] = value;
  };

  // external/micropolisjs/src/tileValues.ts
  var tileValues_exports = {};
  __export(tileValues_exports, {
    AIRPORT: () => AIRPORT,
    AIRPORTBASE: () => AIRPORTBASE,
    BRWH: () => BRWH,
    BRWV: () => BRWV,
    BRWXXX1: () => BRWXXX1,
    BRWXXX2: () => BRWXXX2,
    BRWXXX3: () => BRWXXX3,
    BRWXXX4: () => BRWXXX4,
    BRWXXX5: () => BRWXXX5,
    BRWXXX6: () => BRWXXX6,
    BRWXXX7: () => BRWXXX7,
    CHANNEL: () => CHANNEL,
    CHURCH: () => CHURCH,
    CHURCH0: () => CHURCH0,
    CHURCH0BASE: () => CHURCH0BASE,
    CHURCH1: () => CHURCH1,
    CHURCH1BASE: () => CHURCH1BASE,
    CHURCH2: () => CHURCH2,
    CHURCH2BASE: () => CHURCH2BASE,
    CHURCH3: () => CHURCH3,
    CHURCH3BASE: () => CHURCH3BASE,
    CHURCH4: () => CHURCH4,
    CHURCH4BASE: () => CHURCH4BASE,
    CHURCH5: () => CHURCH5,
    CHURCH5BASE: () => CHURCH5BASE,
    CHURCH6: () => CHURCH6,
    CHURCH6BASE: () => CHURCH6BASE,
    CHURCH7: () => CHURCH7,
    CHURCH7BASE: () => CHURCH7BASE,
    CHURCH7LAST: () => CHURCH7LAST,
    CHURCHBASE: () => CHURCHBASE,
    COALBASE: () => COALBASE,
    COALSMOKE1: () => COALSMOKE1,
    COALSMOKE2: () => COALSMOKE2,
    COALSMOKE3: () => COALSMOKE3,
    COALSMOKE4: () => COALSMOKE4,
    COMBASE: () => COMBASE,
    COMCLR: () => COMCLR,
    COMLAST: () => COMLAST,
    CZB: () => CZB,
    DIRT: () => DIRT,
    FIRE: () => FIRE,
    FIREBASE: () => FIREBASE,
    FIRESTATION: () => FIRESTATION,
    FIRESTBASE: () => FIRESTBASE,
    FIRSTRIVEDGE: () => FIRSTRIVEDGE,
    FLOOD: () => FLOOD,
    FOOTBALLGAME1: () => FOOTBALLGAME1,
    FOOTBALLGAME2: () => FOOTBALLGAME2,
    FOUNTAIN: () => FOUNTAIN,
    FREEZ: () => FREEZ,
    FULLSTADIUM: () => FULLSTADIUM,
    HBRDG0: () => HBRDG0,
    HBRDG1: () => HBRDG1,
    HBRDG2: () => HBRDG2,
    HBRDG3: () => HBRDG3,
    HBRDG_END: () => HBRDG_END,
    HBRIDGE: () => HBRIDGE,
    HHTHR: () => HHTHR,
    HOSPITAL: () => HOSPITAL,
    HOSPITALBASE: () => HOSPITALBASE,
    HOUSE: () => HOUSE,
    HPOWER: () => HPOWER,
    HRAIL: () => HRAIL,
    HRAILROAD: () => HRAILROAD,
    HROADPOWER: () => HROADPOWER,
    HTRFBASE: () => HTRFBASE,
    IND1: () => IND1,
    IND2: () => IND2,
    IND3: () => IND3,
    IND4: () => IND4,
    IND5: () => IND5,
    IND6: () => IND6,
    IND7: () => IND7,
    IND8: () => IND8,
    IND9: () => IND9,
    INDBASE: () => INDBASE,
    INDBASE2: () => INDBASE2,
    INDCLR: () => INDCLR,
    INTERSECTION: () => INTERSECTION,
    IZB: () => IZB,
    LASTFIRE: () => LASTFIRE,
    LASTFLOOD: () => LASTFLOOD,
    LASTIND: () => LASTIND,
    LASTPORT: () => LASTPORT,
    LASTPOWER: () => LASTPOWER,
    LASTPOWERPLANT: () => LASTPOWERPLANT,
    LASTRAIL: () => LASTRAIL,
    LASTRIVEDGE: () => LASTRIVEDGE,
    LASTROAD: () => LASTROAD,
    LASTRUBBLE: () => LASTRUBBLE,
    LASTTINYEXP: () => LASTTINYEXP,
    LASTTREE: () => LASTTREE,
    LASTZONE: () => LASTZONE,
    LHPOWER: () => LHPOWER,
    LHRAIL: () => LHRAIL,
    LHTHR: () => LHTHR,
    LIGHTNINGBOLT: () => LIGHTNINGBOLT,
    LTRFBASE: () => LTRFBASE,
    LVPOWER: () => LVPOWER,
    LVPOWER10: () => LVPOWER10,
    LVPOWER2: () => LVPOWER2,
    LVPOWER3: () => LVPOWER3,
    LVPOWER4: () => LVPOWER4,
    LVPOWER5: () => LVPOWER5,
    LVPOWER6: () => LVPOWER6,
    LVPOWER7: () => LVPOWER7,
    LVPOWER8: () => LVPOWER8,
    LVPOWER9: () => LVPOWER9,
    LVRAIL: () => LVRAIL,
    LVRAIL10: () => LVRAIL10,
    LVRAIL2: () => LVRAIL2,
    LVRAIL3: () => LVRAIL3,
    LVRAIL4: () => LVRAIL4,
    LVRAIL5: () => LVRAIL5,
    LVRAIL6: () => LVRAIL6,
    LVRAIL7: () => LVRAIL7,
    LVRAIL8: () => LVRAIL8,
    LVRAIL9: () => LVRAIL9,
    NUCLEAR: () => NUCLEAR,
    NUCLEARBASE: () => NUCLEARBASE,
    NUKESWIRL1: () => NUKESWIRL1,
    NUKESWIRL2: () => NUKESWIRL2,
    NUKESWIRL3: () => NUKESWIRL3,
    NUKESWIRL4: () => NUKESWIRL4,
    POLICESTATION: () => POLICESTATION,
    POLICESTBASE: () => POLICESTBASE,
    PORT: () => PORT,
    PORTBASE: () => PORTBASE,
    POWERBASE: () => POWERBASE,
    POWERPLANT: () => POWERPLANT,
    RADAR: () => RADAR,
    RADAR0: () => RADAR0,
    RADAR1: () => RADAR1,
    RADAR2: () => RADAR2,
    RADAR3: () => RADAR3,
    RADAR4: () => RADAR4,
    RADAR5: () => RADAR5,
    RADAR6: () => RADAR6,
    RADAR7: () => RADAR7,
    RADTILE: () => RADTILE,
    RAILBASE: () => RAILBASE,
    RAILHPOWERV: () => RAILHPOWERV,
    RAILVPOWERH: () => RAILVPOWERH,
    REDGE: () => REDGE,
    RESBASE: () => RESBASE,
    RIVER: () => RIVER,
    ROADBASE: () => ROADBASE,
    ROADS: () => ROADS,
    ROADS10: () => ROADS10,
    ROADS2: () => ROADS2,
    ROADS3: () => ROADS3,
    ROADS4: () => ROADS4,
    ROADS5: () => ROADS5,
    ROADS6: () => ROADS6,
    ROADS7: () => ROADS7,
    ROADS8: () => ROADS8,
    ROADS9: () => ROADS9,
    ROADVPOWERH: () => ROADVPOWERH,
    RUBBLE: () => RUBBLE,
    RZB: () => RZB,
    SMOKEBASE: () => SMOKEBASE,
    SOMETINYEXP: () => SOMETINYEXP,
    STADIUM: () => STADIUM,
    STADIUMBASE: () => STADIUMBASE,
    TELEBASE: () => TELEBASE,
    TELELAST: () => TELELAST,
    TILE_COUNT: () => TILE_COUNT,
    TILE_INVALID: () => TILE_INVALID2,
    TINYEXP: () => TINYEXP,
    TINYEXPLAST: () => TINYEXPLAST,
    TREEBASE: () => TREEBASE,
    UNUSED_TRASH1: () => UNUSED_TRASH1,
    UNUSED_TRASH2: () => UNUSED_TRASH2,
    UNUSED_TRASH3: () => UNUSED_TRASH3,
    UNUSED_TRASH4: () => UNUSED_TRASH4,
    UNUSED_TRASH5: () => UNUSED_TRASH5,
    UNUSED_TRASH6: () => UNUSED_TRASH6,
    VBRDG0: () => VBRDG0,
    VBRDG1: () => VBRDG1,
    VBRDG2: () => VBRDG2,
    VBRDG3: () => VBRDG3,
    VBRIDGE: () => VBRIDGE,
    VPOWER: () => VPOWER,
    VRAIL: () => VRAIL,
    VRAILROAD: () => VRAILROAD,
    VROADPOWER: () => VROADPOWER,
    WATER_HIGH: () => WATER_HIGH,
    WATER_LOW: () => WATER_LOW,
    WOODS: () => WOODS,
    WOODS2: () => WOODS2,
    WOODS3: () => WOODS3,
    WOODS4: () => WOODS4,
    WOODS5: () => WOODS5,
    WOODS_HIGH: () => WOODS_HIGH,
    WOODS_LOW: () => WOODS_LOW
  });
  var DIRT = 0;
  var RIVER = 2;
  var REDGE = 3;
  var CHANNEL = 4;
  var FIRSTRIVEDGE = 5;
  var LASTRIVEDGE = 20;
  var WATER_LOW = RIVER;
  var WATER_HIGH = LASTRIVEDGE;
  var TREEBASE = 21;
  var WOODS_LOW = TREEBASE;
  var LASTTREE = 36;
  var WOODS = 37;
  var UNUSED_TRASH1 = 38;
  var UNUSED_TRASH2 = 39;
  var WOODS_HIGH = UNUSED_TRASH2;
  var WOODS2 = 40;
  var WOODS3 = 41;
  var WOODS4 = 42;
  var WOODS5 = 43;
  var RUBBLE = 44;
  var LASTRUBBLE = 47;
  var FLOOD = 48;
  var LASTFLOOD = 51;
  var RADTILE = 52;
  var UNUSED_TRASH3 = 53;
  var UNUSED_TRASH4 = 54;
  var UNUSED_TRASH5 = 55;
  var FIRE = 56;
  var FIREBASE = FIRE;
  var LASTFIRE = 63;
  var HBRIDGE = 64;
  var ROADBASE = HBRIDGE;
  var VBRIDGE = 65;
  var ROADS = 66;
  var ROADS2 = 67;
  var ROADS3 = 68;
  var ROADS4 = 69;
  var ROADS5 = 70;
  var ROADS6 = 71;
  var ROADS7 = 72;
  var ROADS8 = 73;
  var ROADS9 = 74;
  var ROADS10 = 75;
  var INTERSECTION = 76;
  var HROADPOWER = 77;
  var VROADPOWER = 78;
  var BRWH = 79;
  var LTRFBASE = 80;
  var BRWV = 95;
  var BRWXXX1 = 111;
  var BRWXXX2 = 127;
  var BRWXXX3 = 143;
  var HTRFBASE = 144;
  var BRWXXX4 = 159;
  var BRWXXX5 = 175;
  var BRWXXX6 = 191;
  var LASTROAD = 206;
  var BRWXXX7 = 207;
  var HPOWER = 208;
  var VPOWER = 209;
  var LHPOWER = 210;
  var LVPOWER = 211;
  var LVPOWER2 = 212;
  var LVPOWER3 = 213;
  var LVPOWER4 = 214;
  var LVPOWER5 = 215;
  var LVPOWER6 = 216;
  var LVPOWER7 = 217;
  var LVPOWER8 = 218;
  var LVPOWER9 = 219;
  var LVPOWER10 = 220;
  var RAILHPOWERV = 221;
  var RAILVPOWERH = 222;
  var POWERBASE = HPOWER;
  var LASTPOWER = RAILVPOWERH;
  var UNUSED_TRASH6 = 223;
  var HRAIL = 224;
  var VRAIL = 225;
  var LHRAIL = 226;
  var LVRAIL = 227;
  var LVRAIL2 = 228;
  var LVRAIL3 = 229;
  var LVRAIL4 = 230;
  var LVRAIL5 = 231;
  var LVRAIL6 = 232;
  var LVRAIL7 = 233;
  var LVRAIL8 = 234;
  var LVRAIL9 = 235;
  var LVRAIL10 = 236;
  var HRAILROAD = 237;
  var VRAILROAD = 238;
  var RAILBASE = HRAIL;
  var LASTRAIL = 238;
  var ROADVPOWERH = 239;
  var RESBASE = 240;
  var FREEZ = 244;
  var HOUSE = 249;
  var LHTHR = HOUSE;
  var HHTHR = 260;
  var RZB = 265;
  var HOSPITALBASE = 405;
  var HOSPITAL = 409;
  var CHURCHBASE = 414;
  var CHURCH0BASE = 414;
  var CHURCH = 418;
  var CHURCH0 = 418;
  var COMBASE = 423;
  var COMCLR = 427;
  var CZB = 436;
  var COMLAST = 609;
  var INDBASE = 612;
  var INDCLR = 616;
  var LASTIND = 620;
  var IND1 = 621;
  var IZB = 625;
  var IND2 = 641;
  var IND3 = 644;
  var IND4 = 649;
  var IND5 = 650;
  var IND6 = 676;
  var IND7 = 677;
  var IND8 = 686;
  var IND9 = 689;
  var PORTBASE = 693;
  var PORT = 698;
  var LASTPORT = 708;
  var AIRPORTBASE = 709;
  var RADAR = 711;
  var AIRPORT = 716;
  var COALBASE = 745;
  var POWERPLANT = 750;
  var LASTPOWERPLANT = 760;
  var FIRESTBASE = 761;
  var FIRESTATION = 765;
  var POLICESTBASE = 770;
  var POLICESTATION = 774;
  var STADIUMBASE = 779;
  var STADIUM = 784;
  var FULLSTADIUM = 800;
  var NUCLEARBASE = 811;
  var NUCLEAR = 816;
  var LASTZONE = 826;
  var LIGHTNINGBOLT = 827;
  var HBRDG0 = 828;
  var HBRDG1 = 829;
  var HBRDG2 = 830;
  var HBRDG3 = 831;
  var HBRDG_END = 832;
  var RADAR0 = 832;
  var RADAR1 = 833;
  var RADAR2 = 834;
  var RADAR3 = 835;
  var RADAR4 = 836;
  var RADAR5 = 837;
  var RADAR6 = 838;
  var RADAR7 = 839;
  var FOUNTAIN = 840;
  var INDBASE2 = 844;
  var TELEBASE = 844;
  var TELELAST = 851;
  var SMOKEBASE = 852;
  var TINYEXP = 860;
  var SOMETINYEXP = 864;
  var LASTTINYEXP = 867;
  var TINYEXPLAST = 883;
  var COALSMOKE1 = 916;
  var COALSMOKE2 = 920;
  var COALSMOKE3 = 924;
  var COALSMOKE4 = 928;
  var FOOTBALLGAME1 = 932;
  var FOOTBALLGAME2 = 940;
  var VBRDG0 = 948;
  var VBRDG1 = 949;
  var VBRDG2 = 950;
  var VBRDG3 = 951;
  var NUKESWIRL1 = 952;
  var NUKESWIRL2 = 953;
  var NUKESWIRL3 = 954;
  var NUKESWIRL4 = 955;
  var CHURCH1BASE = 956;
  var CHURCH1 = 960;
  var CHURCH2BASE = 965;
  var CHURCH2 = 969;
  var CHURCH3BASE = 974;
  var CHURCH3 = 978;
  var CHURCH4BASE = 983;
  var CHURCH4 = 987;
  var CHURCH5BASE = 992;
  var CHURCH5 = 996;
  var CHURCH6BASE = 1001;
  var CHURCH6 = 1005;
  var CHURCH7BASE = 1010;
  var CHURCH7 = 1014;
  var CHURCH7LAST = 1018;
  var TILE_COUNT = 1024;
  var TILE_INVALID2 = -1;

  // external/micropolisjs/src/random.ts
  function getChance(chance, rng = getRandom16) {
    return (rng() & chance) === 0;
  }
  function getERandom(max, rng = getRandom) {
    const firstCandidate = rng(max);
    const secondCandidate = rng(max);
    return Math.min(firstCandidate, secondCandidate);
  }
  var randomSource = { random: () => Math.random(), floor: (n) => Math.floor(n) };
  function setRandomSource(random) {
    randomSource.random = random || (() => Math.random());
  }
  function getRandom(max, mathGlobal = randomSource) {
    return mathGlobal.floor(mathGlobal.random() * (max + 1));
  }
  function getRandom16(rng = getRandom) {
    return rng(65535);
  }
  function getRandom16Signed(rng = getRandom16) {
    const value = rng();
    if (value < 32768) {
      return value;
    } else {
      return -(2 ** 16) + value;
    }
  }
  var Random = {
    getChance,
    getERandom,
    getRandom,
    getRandom16,
    getRandom16Signed,
    setRandomSource
  };

  // external/micropolisjs/src/tile.ts
  var Tile = class {
    constructor(value = DIRT, flags = 0) {
      this.validateArguments(value, flags, "Tile constructor");
      this.value = value | flags;
    }
    getValue() {
      return this.valueFromCombinedValue(this.value);
    }
    getFlags() {
      return this.flagsFromCombinedValue(this.value);
    }
    getRawValue() {
      return this.value;
    }
    addFlags(flags) {
      this.validateFlags(flags, "addFlags");
      if (flags === NOFLAGS) {
        return;
      }
      this.value |= flags;
    }
    setValue(desiredValue) {
      if (desiredValue < TILE_INVALID2) {
        throw new Error(`setValue called with out-of-range value ${desiredValue}`);
      }
      const value = this.valueFromCombinedValue(desiredValue);
      const bitMask = this.flagsToSetFromCombinedValue(desiredValue);
      this.set(value, bitMask);
    }
    setFlags(flags) {
      this.validateFlags(flags, "setFlags");
      const existingValue = this.value & ~ALLBITS;
      this.value = existingValue | flags;
    }
    removeFlags(flags) {
      this.validateFlags(flags, "removeFlags");
      if (flags === NOFLAGS) {
        return;
      }
      this.value &= ~flags;
    }
    setFrom(tile3) {
      this.value = tile3.value;
    }
    set(value, flags) {
      this.validateArguments(value, flags, "set");
      this.value = value | flags;
    }
    isAnimated() {
      return this.checkBits(ANIMBIT);
    }
    isBulldozable() {
      return this.checkBits(BULLBIT);
    }
    isConductive() {
      return this.checkBits(CONDBIT);
    }
    isCombustible() {
      return this.checkBits(BURNBIT);
    }
    isPowered() {
      return this.checkBits(POWERBIT);
    }
    isZone() {
      return this.checkBits(ZONEBIT);
    }
    toString() {
      const qualities = ["animated", "bulldozable", "combustible", "conductive", "powered", "zone"];
      const qualitiesText = qualities.map((quality) => this.getQualityText(quality)).join(", ");
      const tileValue = this.getValue();
      return `Tile# ${tileValue}: ${qualitiesText}`;
    }
    getQualityText(quality) {
      const predicate = this.predicateForQuality(quality);
      const qualityValue = this[predicate]();
      return `${quality}: ${this.summariseBoolean(qualityValue)}`;
    }
    predicateForQuality(quality) {
      return `is${quality[0].toUpperCase()}${quality.slice(1)}`;
    }
    summariseBoolean(bool) {
      return bool ? `\u2714` : `\u2718`;
    }
    valueFromCombinedValue(value) {
      return value & BIT_MASK;
    }
    flagsFromCombinedValue(value) {
      return value & ALLBITS;
    }
    flagsToSetFromCombinedValue(value) {
      const embeddedFlags = this.flagsFromCombinedValue(value);
      return embeddedFlags > 0 ? embeddedFlags : this.getFlags();
    }
    checkBits(flag) {
      return (this.value & flag) > 0;
    }
    validateArguments(value, flags, context) {
      this.validateValue(value, context);
      this.validateFlags(flags, context);
    }
    validateValue(value, context) {
      if (this.valueIsInvalid(value)) {
        throw new Error(`${context} called with out-of-range value ${value}`);
      }
    }
    validateFlags(flags, context) {
      if (this.flagsAreInvalid(flags)) {
        throw new Error(`${context} called with out-of-range flags 0x${flags.toString(16)}`);
      }
    }
    valueIsInvalid(value) {
      return value < TILE_INVALID2 || value >= TILE_COUNT;
    }
    flagsAreInvalid(flags) {
      return flags !== 0 && (flags < BIT_START || (flags & ~ALLBITS) !== 0);
    }
  };

  // external/micropolisjs/src/tileUtils.js
  var unwrapTile = function(f) {
    return function(tile3) {
      if (tile3 instanceof Tile)
        tile3 = tile3.getValue();
      return f.call(null, tile3);
    };
  };
  var canBulldoze = unwrapTile(function(tileValue) {
    return tileValue >= FIRSTRIVEDGE && tileValue <= LASTRUBBLE || tileValue >= POWERBASE + 2 && tileValue <= POWERBASE + 12 || tileValue >= TINYEXP && tileValue <= LASTTINYEXP + 2;
  });
  var isCommercial = unwrapTile(function(tile3) {
    return tile3 >= COMBASE && tile3 < INDBASE;
  });
  var isCommercialZone = function(tile3) {
    return tile3.isZone() && isCommercial(tile3);
  };
  var isDriveable = unwrapTile(function(tile3) {
    return tile3 >= ROADBASE && tile3 <= LASTROAD || tile3 >= RAILHPOWERV && tile3 <= LASTRAIL;
  });
  var isFire = unwrapTile(function(tile3) {
    return tile3 >= FIREBASE && tile3 < ROADBASE;
  });
  var isFlood = unwrapTile(function(tile3) {
    return tile3 >= FLOOD && tile3 < LASTFLOOD;
  });
  var isIndustrial = unwrapTile(function(tile3) {
    return tile3 >= INDBASE && tile3 < PORTBASE;
  });
  var isIndustrialZone = function(tile3) {
    return tile3.isZone() && isIndustrial(tile3);
  };
  var isManualExplosion = unwrapTile(function(tile3) {
    return tile3 >= TINYEXP && tile3 <= LASTTINYEXP;
  });
  var isRail = unwrapTile(function(tile3) {
    return tile3 >= RAILBASE && tile3 < RESBASE;
  });
  var isResidential = unwrapTile(function(tile3) {
    return tile3 >= RESBASE && tile3 < HOSPITALBASE;
  });
  var isResidentialZone = function(tile3) {
    return tile3.isZone() && isResidential(tile3);
  };
  var isRoad = unwrapTile(function(tile3) {
    return tile3 >= ROADBASE && tile3 < POWERBASE;
  });
  var normalizeRoad = unwrapTile(function(tile3) {
    return tile3 >= ROADBASE && tile3 <= LASTROAD + 1 ? (tile3 & 15) + 64 : tile3;
  });
  var randomFire = function() {
    return new Tile(FIRE + (Random.getRandom16() & 3), ANIMBIT);
  };
  var randomRubble = function() {
    return new Tile(RUBBLE + (Random.getRandom16() & 3), BULLBIT);
  };
  var TileUtils = {
    canBulldoze,
    isCommercial,
    isCommercialZone,
    isDriveable,
    isFire,
    isFlood,
    isIndustrial,
    isIndustrialZone,
    isManualExplosion,
    isRail,
    isResidential,
    isResidentialZone,
    isRoad,
    normalizeRoad,
    randomFire,
    randomRubble
  };

  // external/micropolisjs/src/animationManager.js
  function AnimationManager(map, animationPeriod, blinkPeriod) {
    animationPeriod = animationPeriod || 50;
    blinkPeriod = blinkPeriod || 500;
    this._map = map;
    this.animationPeriod = animationPeriod;
    this.lastAnimation = new Date(1970, 1, 1);
    this.lastBlink = new Date(1970, 1, 1);
    this.blinkPeriod = blinkPeriod;
    this.shouldBlink = false;
    this._lastPainted = null;
    this._currentPainted = null;
    this._data = [];
    this.initArray();
    this.registerAnimations();
  }
  AnimationManager.prototype.initArray = function() {
    for (var i = 0; i < TILE_COUNT; i++)
      this._data[i] = i;
  };
  AnimationManager.prototype.inSequence = function(tileValue, lastValue) {
    var seen = [tileValue];
    var current = this._data[tileValue];
    while (seen.indexOf(current) === -1) {
      if (current === lastValue)
        return true;
      seen.push(current);
      current = this._data[current];
    }
    return false;
  };
  AnimationManager.prototype.getTiles = function(tileValues, offsetX, offsetY, xBound, yBound, isPaused) {
    isPaused = isPaused || false;
    var shouldChangeAnimation = false;
    var d = /* @__PURE__ */ new Date();
    var shouldBlink = this.shouldBlink;
    if (d - this.lastBlink > this.blinkPeriod) {
      shouldBlink = this.shouldBlink = !this.shouldBlink;
      this.lastBlink = d;
    }
    if (!isPaused) {
      if (d - this.lastAnimation > this.animationPeriod) {
        shouldChangeAnimation = true;
        this.lastAnimation = d;
      }
    }
    var newPainted = this._currentPainted === null ? new TileHistory() : this._currentPainted;
    for (var y = 0; y < yBound; y++) {
      for (var x = 0; x < xBound; x++) {
        var mapX = x + offsetX;
        var mapY = y + offsetY;
        var index = y * xBound + x;
        if (mapX < 0 || mapX >= this._map.width || mapY < 0 || mapY >= this._map.height)
          continue;
        var tile3 = tileValues[index];
        if (tile3 === TILE_INVALID2)
          continue;
        if (shouldBlink && tile3 & ZONEBIT && !(tile3 & POWERBIT)) {
          tileValues[index] = LIGHTNINGBOLT;
          continue;
        }
        if (!(tile3 & ANIMBIT)) {
          tileValues[index] = tile3 & BIT_MASK;
          continue;
        }
        var tileValue = tile3 & BIT_MASK;
        var newTile = TILE_INVALID2;
        var last;
        if (this._lastPainted)
          last = this._lastPainted.getTile(x, y);
        if (shouldChangeAnimation) {
          if (last && this.inSequence(tileValue, last)) {
            if (last === LASTTINYEXP) {
              this._map.setTo(mapX, mapY, TileUtils.randomRubble());
              newTile = this._map.getTileValue(mapX, mapY);
            } else {
              newTile = this._data[last];
            }
          } else {
            newTile = this._data[tileValue];
          }
        } else {
          if (last && this.inSequence(tileValue, last))
            newTile = last;
        }
        if (newTile === TILE_INVALID2) {
          tileValues[index] = tileValue;
          continue;
        }
        tileValues[index] = newTile;
        newPainted.setTile(x, y, newTile);
      }
    }
    var temp = this._lastPainted;
    this._lastPainted = newPainted;
    if (temp !== null)
      temp.clear();
    this._currentPainted = temp;
  };
  AnimationManager.prototype.registerSingleAnimation = function(arr) {
    for (var i = 1; i < arr.length; i++)
      this._data[arr[i - 1]] = arr[i];
  };
  AnimationManager.prototype.registerAnimations = function() {
    this.registerSingleAnimation([56, 57, 58, 59, 60, 61, 62, 63, 56]);
    this.registerSingleAnimation([80, 128, 112, 96, 80]);
    this.registerSingleAnimation([81, 129, 113, 97, 81]);
    this.registerSingleAnimation([82, 130, 114, 98, 82]);
    this.registerSingleAnimation([83, 131, 115, 99, 83]);
    this.registerSingleAnimation([84, 132, 116, 100, 84]);
    this.registerSingleAnimation([85, 133, 117, 101, 85]);
    this.registerSingleAnimation([86, 134, 118, 102, 86]);
    this.registerSingleAnimation([87, 135, 119, 103, 87]);
    this.registerSingleAnimation([88, 136, 120, 104, 88]);
    this.registerSingleAnimation([89, 137, 121, 105, 89]);
    this.registerSingleAnimation([90, 138, 122, 106, 90]);
    this.registerSingleAnimation([91, 139, 123, 107, 91]);
    this.registerSingleAnimation([92, 140, 124, 108, 92]);
    this.registerSingleAnimation([93, 141, 125, 109, 93]);
    this.registerSingleAnimation([94, 142, 126, 110, 94]);
    this.registerSingleAnimation([95, 143, 127, 111, 95]);
    this.registerSingleAnimation([144, 192, 176, 160, 144]);
    this.registerSingleAnimation([145, 193, 177, 161, 145]);
    this.registerSingleAnimation([146, 194, 178, 162, 146]);
    this.registerSingleAnimation([147, 195, 179, 163, 147]);
    this.registerSingleAnimation([148, 196, 180, 164, 148]);
    this.registerSingleAnimation([149, 197, 181, 165, 149]);
    this.registerSingleAnimation([150, 198, 182, 166, 150]);
    this.registerSingleAnimation([151, 199, 183, 167, 151]);
    this.registerSingleAnimation([152, 200, 184, 168, 152]);
    this.registerSingleAnimation([153, 201, 185, 169, 153]);
    this.registerSingleAnimation([154, 202, 186, 170, 154]);
    this.registerSingleAnimation([155, 203, 187, 171, 155]);
    this.registerSingleAnimation([156, 204, 188, 172, 156]);
    this.registerSingleAnimation([157, 205, 189, 173, 157]);
    this.registerSingleAnimation([158, 206, 190, 174, 158]);
    this.registerSingleAnimation([159, 207, 191, 175, 159]);
    this.registerSingleAnimation([621, 852, 853, 854, 855, 856, 857, 858, 859, 852]);
    this.registerSingleAnimation([641, 884, 885, 886, 887, 884]);
    this.registerSingleAnimation([644, 888, 889, 890, 891, 888]);
    this.registerSingleAnimation([649, 892, 893, 894, 895, 892]);
    this.registerSingleAnimation([650, 896, 897, 898, 899, 896]);
    this.registerSingleAnimation([676, 900, 901, 902, 903, 900]);
    this.registerSingleAnimation([677, 904, 905, 906, 907, 904]);
    this.registerSingleAnimation([686, 908, 909, 910, 911, 908]);
    this.registerSingleAnimation([689, 912, 913, 914, 915, 912]);
    this.registerSingleAnimation([747, 916, 917, 918, 919, 916]);
    this.registerSingleAnimation([748, 920, 921, 922, 923, 920]);
    this.registerSingleAnimation([751, 924, 925, 926, 927, 924]);
    this.registerSingleAnimation([752, 928, 929, 930, 931, 928]);
    this.registerSingleAnimation([820, 952, 953, 954, 955, 952]);
    this.registerSingleAnimation([832, 833, 834, 835, 836, 837, 838, 839, 832]);
    this.registerSingleAnimation([840, 841, 842, 843, 840]);
    this.registerSingleAnimation([844, 845, 846, 847, 848, 849, 850, 851, 844]);
    this.registerSingleAnimation([860, 861, 862, 863, 864, 865, 866, 867]);
    this.registerSingleAnimation([932, 933, 934, 935, 936, 937, 938, 939, 932]);
    this.registerSingleAnimation([940, 941, 942, 943, 944, 945, 946, 947, 940]);
  };

  // external/micropolisjs/src/miscUtils.js
  var clamp = function(value, min, max) {
    if (value < min)
      return min;
    if (value > max)
      return max;
    return value;
  };
  var makeConstantDescriptor = function(value) {
    return {
      configurable: false,
      enumerable: false,
      writeable: false,
      value
    };
  };
  var normaliseDOMid = function(id) {
    return (id[0] !== "#" ? "#" : "") + id;
  };
  var reflectEvent = function(message, value) {
    this._emitEvent(message, value);
  };
  var MiscUtils = {
    clamp,
    makeConstantDescriptor,
    normaliseDOMid,
    reflectEvent
  };

  // external/micropolisjs/src/worldEffects.js
  function WorldEffects(map) {
    this._map = map;
    this._data = {};
  }
  var toKey2 = function(x, y) {
    return [x, y].join(",");
  };
  var fromKey = function(k) {
    k = k.split(",");
    return { x: k[0] - 0, y: k[1] - 0, toString: function() {
      return "World effect coord: (" + k[0] + ", " + k[1] + ")";
    } };
  };
  WorldEffects.prototype.clear = function() {
    this._data = [];
  };
  WorldEffects.prototype.getTile = function(x, y) {
    var key = toKey2(x, y);
    var tile3 = this._data[key];
    if (tile3 === void 0)
      tile3 = this._map.getTile(x, y);
    return tile3;
  };
  WorldEffects.prototype.getTileValue = function(x, y) {
    return this.getTile(x, y).getValue();
  };
  WorldEffects.prototype.setTile = function(x, y, value, flags) {
    if (flags !== void 0 && value instanceof Tile)
      throw new Error("Flags supplied with already defined tile");
    if (!this._map.testBounds(x, y))
      throw new Error("WorldEffects setTile called with invalid bounds " + x + ", " + y);
    if (flags === void 0 && !(value instanceof Tile))
      value = new Tile(value);
    else if (flags !== void 0)
      value = new Tile(value, flags);
    var key = toKey2(x, y);
    this._data[key] = value;
  };
  WorldEffects.prototype.apply = function() {
    var keys = Object.keys(this._data);
    for (var i = 0, l = keys.length; i < l; i++) {
      var coords = fromKey(keys[i]);
      this._map.setTo(coords, this._data[keys[i]]);
    }
  };

  // external/micropolisjs/src/baseTool.js
  var init = function(cost, map, shouldAutoBulldoze, isDraggable) {
    isDraggable = isDraggable || false;
    Object.defineProperty(this, "toolCost", MiscUtils.makeConstantDescriptor(cost));
    this.result = null;
    this.isDraggable = isDraggable;
    this._shouldAutoBulldoze = shouldAutoBulldoze;
    this._map = map;
    this._worldEffects = new WorldEffects(map);
    this._applicationCost = 0;
  };
  var clear = function() {
    this._applicationCost = 0;
    this._worldEffects.clear();
  };
  var addCost = function(cost) {
    this._applicationCost += cost;
  };
  var doAutoBulldoze = function(x, y) {
    var tile3 = this._worldEffects.getTile(x, y);
    if (tile3.isBulldozable()) {
      tile3 = TileUtils.normalizeRoad(tile3.getValue());
      if (tile3 >= TINYEXP && tile3 <= LASTTINYEXP || tile3 < HBRIDGE && tile3 !== DIRT) {
        this.addCost(1);
        this._worldEffects.setTile(x, y, DIRT);
      }
    }
  };
  var apply = function(budget) {
    this._worldEffects.apply();
    budget.spend(this._applicationCost);
    this.clear();
  };
  var modifyIfEnoughFunding = function(budget) {
    if (this.result !== this.TOOLRESULT_OK) {
      this.clear();
      return false;
    }
    if (budget.totalFunds < this._applicationCost) {
      this.result = this.TOOLRESULT_NO_MONEY;
      this.clear();
      return false;
    }
    apply.call(this, budget);
    this.clear();
    return true;
  };
  var TOOLRESULT_OK = 0;
  var TOOLRESULT_FAILED = 1;
  var TOOLRESULT_NO_MONEY = 2;
  var TOOLRESULT_NEEDS_BULLDOZE = 3;
  var BaseToolConstructor = {
    addCost,
    autoBulldoze: true,
    bulldozerCost: 1,
    clear,
    doAutoBulldoze,
    init,
    modifyIfEnoughFunding,
    TOOLRESULT_OK,
    TOOLRESULT_FAILED,
    TOOLRESULT_NO_MONEY,
    TOOLRESULT_NEEDS_BULLDOZE
  };
  var save = function(saveData) {
    saveData.autoBulldoze = BaseToolConstructor.autoBulldoze;
  };
  var load = function(saveData) {
    BaseTool.autoBulldoze = saveData.autoBulldoze;
  };
  var makeTool = function(toolConstructor) {
    toolConstructor.prototype = Object.create(BaseToolConstructor);
    return toolConstructor;
  };
  var BaseTool = {
    makeTool,
    setAutoBulldoze: function(value) {
      BaseToolConstructor.autoBulldoze = value;
    },
    getAutoBulldoze: function() {
      return BaseToolConstructor.autoBulldoze;
    },
    save,
    load
  };

  // external/micropolisjs/src/connector.js
  var RoadTable = [
    ROADS,
    ROADS2,
    ROADS,
    ROADS3,
    ROADS2,
    ROADS2,
    ROADS4,
    ROADS8,
    ROADS,
    ROADS6,
    ROADS,
    ROADS7,
    ROADS5,
    ROADS10,
    ROADS9,
    INTERSECTION
  ];
  var RailTable = [
    LHRAIL,
    LVRAIL,
    LHRAIL,
    LVRAIL2,
    LVRAIL,
    LVRAIL,
    LVRAIL3,
    LVRAIL7,
    LHRAIL,
    LVRAIL5,
    LHRAIL,
    LVRAIL6,
    LVRAIL4,
    LVRAIL9,
    LVRAIL8,
    LVRAIL10
  ];
  var WireTable = [
    LHPOWER,
    LVPOWER,
    LHPOWER,
    LVPOWER2,
    LVPOWER,
    LVPOWER,
    LVPOWER3,
    LVPOWER7,
    LHPOWER,
    LVPOWER5,
    LHPOWER,
    LVPOWER6,
    LVPOWER4,
    LVPOWER9,
    LVPOWER8,
    LVPOWER10
  ];
  var fixSingle = function(x, y) {
    var adjTile = 0;
    var tile3 = this._worldEffects.getTile(x, y);
    tile3 = TileUtils.normalizeRoad(tile3);
    if (tile3 >= ROADS && tile3 <= INTERSECTION) {
      if (y > 0) {
        tile3 = this._worldEffects.getTileValue(x, y - 1);
        tile3 = TileUtils.normalizeRoad(tile3);
        if ((tile3 === HRAILROAD || tile3 >= ROADBASE && tile3 <= VROADPOWER) && tile3 !== HROADPOWER && tile3 !== VRAILROAD && tile3 !== ROADBASE)
          adjTile |= 1;
      }
      if (x < this._map.width - 1) {
        tile3 = this._worldEffects.getTileValue(x + 1, y);
        tile3 = TileUtils.normalizeRoad(tile3);
        if ((tile3 === VRAILROAD || tile3 >= ROADBASE && tile3 <= VROADPOWER) && tile3 !== VROADPOWER && tile3 !== HRAILROAD && tile3 !== VBRIDGE)
          adjTile |= 2;
      }
      if (y < this._map.height - 1) {
        tile3 = this._worldEffects.getTileValue(x, y + 1);
        tile3 = TileUtils.normalizeRoad(tile3);
        if ((tile3 === HRAILROAD || tile3 >= ROADBASE && tile3 <= VROADPOWER) && tile3 !== HROADPOWER && tile3 !== VRAILROAD && tile3 !== ROADBASE)
          adjTile |= 4;
      }
      if (x > 0) {
        tile3 = this._worldEffects.getTileValue(x - 1, y);
        tile3 = TileUtils.normalizeRoad(tile3);
        if ((tile3 === VRAILROAD || tile3 >= ROADBASE && tile3 <= VROADPOWER) && tile3 !== VROADPOWER && tile3 !== HRAILROAD && tile3 !== VBRIDGE)
          adjTile |= 8;
      }
      this._worldEffects.setTile(x, y, RoadTable[adjTile], BULLBIT | BURNBIT);
      return;
    }
    if (tile3 >= LHRAIL && tile3 <= LVRAIL10) {
      if (y > 0) {
        tile3 = this._worldEffects.getTileValue(x, y - 1);
        tile3 = TileUtils.normalizeRoad(tile3);
        if (tile3 >= RAILHPOWERV && tile3 <= VRAILROAD && tile3 !== RAILHPOWERV && tile3 !== HRAILROAD && tile3 !== HRAIL)
          adjTile |= 1;
      }
      if (x < this._map.width - 1) {
        tile3 = this._worldEffects.getTileValue(x + 1, y);
        tile3 = TileUtils.normalizeRoad(tile3);
        if (tile3 >= RAILHPOWERV && tile3 <= VRAILROAD && tile3 !== RAILVPOWERH && tile3 !== VRAILROAD && tile3 !== VRAIL)
          adjTile |= 2;
      }
      if (y < this._map.height - 1) {
        tile3 = this._worldEffects.getTileValue(x, y + 1);
        tile3 = TileUtils.normalizeRoad(tile3);
        if (tile3 >= RAILHPOWERV && tile3 <= VRAILROAD && tile3 !== RAILHPOWERV && tile3 !== HRAILROAD && tile3 !== HRAIL)
          adjTile |= 4;
      }
      if (x > 0) {
        tile3 = this._worldEffects.getTileValue(x - 1, y);
        tile3 = TileUtils.normalizeRoad(tile3);
        if (tile3 >= RAILHPOWERV && tile3 <= VRAILROAD && tile3 !== RAILVPOWERH && tile3 !== VRAILROAD && tile3 !== VRAIL)
          adjTile |= 8;
      }
      this._worldEffects.setTile(x, y, RailTable[adjTile], BULLBIT | BURNBIT);
      return;
    }
    if (tile3 >= LHPOWER && tile3 <= LVPOWER10) {
      if (y > 0) {
        tile3 = this._worldEffects.getTile(x, y - 1);
        if (tile3.isConductive()) {
          tile3 = tile3.getValue();
          tile3 = TileUtils.normalizeRoad(tile3);
          if (tile3 !== VPOWER && tile3 !== VROADPOWER && tile3 !== RAILVPOWERH)
            adjTile |= 1;
        }
      }
      if (x < this._map.width - 1) {
        tile3 = this._worldEffects.getTile(x + 1, y);
        if (tile3.isConductive()) {
          tile3 = tile3.getValue();
          tile3 = TileUtils.normalizeRoad(tile3);
          if (tile3 !== HPOWER && tile3 !== HROADPOWER && tile3 !== RAILHPOWERV)
            adjTile |= 2;
        }
      }
      if (y < this._map.height - 1) {
        tile3 = this._worldEffects.getTile(x, y + 1);
        if (tile3.isConductive()) {
          tile3 = tile3.getValue();
          tile3 = TileUtils.normalizeRoad(tile3);
          if (tile3 !== VPOWER && tile3 !== VROADPOWER && tile3 !== RAILVPOWERH)
            adjTile |= 4;
        }
      }
      if (x > 0) {
        tile3 = this._worldEffects.getTile(x - 1, y);
        if (tile3.isConductive()) {
          tile3 = tile3.getValue();
          tile3 = TileUtils.normalizeRoad(tile3);
          if (tile3 !== HPOWER && tile3 !== HROADPOWER && tile3 !== RAILHPOWERV)
            adjTile |= 8;
        }
      }
      this._worldEffects.setTile(x, y, WireTable[adjTile], BLBNCNBIT);
      return;
    }
  };
  var checkZoneConnections = function(x, y) {
    this.fixSingle(x, y);
    if (y > 0)
      this.fixSingle(x, y - 1);
    if (x < this._map.width - 1)
      this.fixSingle(x + 1, y);
    if (y < this._map.height - 1)
      this.fixSingle(x, y + 1);
    if (x > 0)
      this.fixSingle(x - 1, y);
  };
  var checkBorder = function(x, y, size) {
    x = x - 1;
    y = y - 1;
    var i;
    for (i = 0; i < size; i++)
      this.fixZone(x + i, y - 1);
    for (i = 0; i < size; i++)
      this.fixZone(x - 1, y + i);
    for (i = 0; i < size; i++)
      this.fixZone(x + i, y + size);
    for (i = 0; i < size; i++)
      this.fixZone(x + size, y + i);
  };
  var Connector = function(toolConstructor) {
    toolConstructor.prototype.checkZoneConnections = checkZoneConnections;
    toolConstructor.prototype.fixSingle = fixSingle;
    toolConstructor.prototype.checkBorder = checkBorder;
    return toolConstructor;
  };

  // external/micropolisjs/src/connectingTool.js
  var makeTool2 = BaseTool.makeTool;
  var ConnectingTool = function(toolConstructor) {
    return Connector(makeTool2(toolConstructor));
  };

  // external/micropolisjs/src/buildingTool.js
  var BuildingTool = ConnectingTool(function(cost, centreTile, map, size, animated2) {
    this.init(cost, map, false);
    this.centreTile = centreTile;
    this.size = size;
    this.animated = animated2;
  });
  BuildingTool.prototype.putBuilding = function(leftX, topY) {
    var posX, posY, tileValue, tileFlags;
    var baseTile = this.centreTile - this.size - 1;
    for (var dy = 0; dy < this.size; dy++) {
      posY = topY + dy;
      for (var dx = 0; dx < this.size; dx++) {
        posX = leftX + dx;
        tileValue = baseTile;
        tileFlags = BNCNBIT;
        if (dx === 1) {
          if (dy === 1)
            tileFlags |= ZONEBIT;
          else if (dy === 2 && this.animated)
            tileFlags |= ANIMBIT;
        }
        this._worldEffects.setTile(posX, posY, tileValue, tileFlags);
        baseTile++;
      }
    }
  };
  BuildingTool.prototype.prepareBuildingSite = function(leftX, topY) {
    if (leftX < 0 || leftX + this.size > this._map.width)
      return this.TOOLRESULT_FAILED;
    if (topY < 0 || topY + this.size > this._map.height)
      return this.TOOLRESULT_FAILED;
    var posX, posY, tileValue;
    for (var dy = 0; dy < this.size; dy++) {
      posY = topY + dy;
      for (var dx = 0; dx < this.size; dx++) {
        posX = leftX + dx;
        tileValue = this._worldEffects.getTileValue(posX, posY);
        if (tileValue === DIRT)
          continue;
        if (!this.autoBulldoze) {
          return this.TOOLRESULT_NEEDS_BULLDOZE;
        }
        if (!TileUtils.canBulldoze(tileValue)) {
          return this.TOOLRESULT_NEEDS_BULLDOZE;
        }
        this._worldEffects.setTile(posX, posY, DIRT);
        this.addCost(this.bulldozerCost);
      }
    }
    return this.TOOLRESULT_OK;
  };
  BuildingTool.prototype.buildBuilding = function(x, y) {
    x--;
    y--;
    var prepareResult = this.prepareBuildingSite(x, y);
    if (prepareResult !== this.TOOLRESULT_OK)
      return prepareResult;
    this.addCost(this.toolCost);
    this.putBuilding(x, y);
    this.checkBorder(x, y);
    return this.TOOLRESULT_OK;
  };
  BuildingTool.prototype.doTool = function(x, y, blockMaps) {
    this.result = this.buildBuilding(x, y);
  };

  // external/micropolisjs/src/config.js
  var Config = {
    debug: false,
    gameDebug: false,
    queryDebug: false
  };

  // external/micropolisjs/src/eventEmitter.js
  var EventEmitter = function(obj) {
    var events = {};
    var addListener = function(event, listener) {
      if (!(event in events))
        events[event] = [];
      var listeners = events[event];
      if (listeners.indexOf(listener) === -1)
        listeners.push(listener);
    };
    var removeListener = function(event, listener) {
      if (!(event in events))
        events[event] = [];
      var listeners = events[event];
      var index = listeners.indexOf(listener);
      if (index !== -1)
        listeners.splice(index, 1);
    };
    var emitEvent = function(event, value) {
      if (event === void 0) {
        if (!Config.debug)
          console.warn("Sending undefined event!");
        else
          throw new Error("Sending undefined event!");
      }
      if (!(event in events))
        events[event] = [];
      var listeners = events[event];
      for (var i = 0, l = listeners.length; i < l; i++)
        listeners[i](value);
    };
    var addProps = function(obj2, message) {
      var hasExistingProp = ["addEventListener", "removeEventListener", "_emitEvent"].some(function(prop) {
        return obj2[prop] !== void 0;
      });
      if (hasExistingProp)
        throw new Error("Cannot decorate " + message + ": existing properties would be overwritten!");
      obj2.addEventListener = addListener;
      obj2.removeEventListener = removeListener;
      obj2._emitEvent = emitEvent;
    };
    if (typeof obj === "object")
      addProps(obj, "object");
    else
      addProps(obj.prototype, "constructor");
    return obj;
  };

  // external/micropolisjs/src/messages.ts
  var messages_exports = {};
  __export(messages_exports, {
    AUTOBUDGET_CHANGED: () => AUTOBUDGET_CHANGED,
    BLACKOUTS_REPORTED: () => BLACKOUTS_REPORTED,
    BUDGET_NEEDED: () => BUDGET_NEEDED,
    BUDGET_REQUESTED: () => BUDGET_REQUESTED,
    BUDGET_WINDOW_CLOSED: () => BUDGET_WINDOW_CLOSED,
    CLASSIFICATION_UPDATED: () => CLASSIFICATION_UPDATED,
    CONGRATS_SHOWING: () => CONGRATS_SHOWING,
    CONGRATS_WINDOW_CLOSED: () => CONGRATS_WINDOW_CLOSED,
    CRASHES: () => CRASHES,
    DATE_UPDATED: () => DATE_UPDATED,
    DEBUG_WINDOW_CLOSED: () => DEBUG_WINDOW_CLOSED,
    DEBUG_WINDOW_REQUESTED: () => DEBUG_WINDOW_REQUESTED,
    DISASTER_MESSAGES: () => DISASTER_MESSAGES,
    DISASTER_REQUESTED: () => DISASTER_REQUESTED,
    DISASTER_WINDOW_CLOSED: () => DISASTER_WINDOW_CLOSED,
    EARTHQUAKE: () => EARTHQUAKE,
    EVAL_REQUESTED: () => EVAL_REQUESTED,
    EVAL_UPDATED: () => EVAL_UPDATED,
    EVAL_WINDOW_CLOSED: () => EVAL_WINDOW_CLOSED,
    EXPLOSION_REPORTED: () => EXPLOSION_REPORTED,
    FIRE_REPORTED: () => FIRE_REPORTED,
    FIRE_STATION_NEEDS_FUNDING: () => FIRE_STATION_NEEDS_FUNDING,
    FLOODING_REPORTED: () => FLOODING_REPORTED,
    FRONT_END_MESSAGE: () => FRONT_END_MESSAGE,
    FUNDS_CHANGED: () => FUNDS_CHANGED,
    HEAVY_TRAFFIC: () => HEAVY_TRAFFIC,
    HELICOPTER_CRASHED: () => HELICOPTER_CRASHED,
    HIGH_CRIME: () => HIGH_CRIME,
    HIGH_POLLUTION: () => HIGH_POLLUTION,
    MONSTER_SIGHTED: () => MONSTER_SIGHTED,
    NAG_WINDOW_CLOSED: () => NAG_WINDOW_CLOSED,
    NEED_AIRPORT: () => NEED_AIRPORT,
    NEED_ELECTRICITY: () => NEED_ELECTRICITY,
    NEED_FIRE_STATION: () => NEED_FIRE_STATION,
    NEED_MORE_COMMERCIAL: () => NEED_MORE_COMMERCIAL,
    NEED_MORE_INDUSTRIAL: () => NEED_MORE_INDUSTRIAL,
    NEED_MORE_RAILS: () => NEED_MORE_RAILS,
    NEED_MORE_RESIDENTIAL: () => NEED_MORE_RESIDENTIAL,
    NEED_MORE_ROADS: () => NEED_MORE_ROADS,
    NEED_POLICE_STATION: () => NEED_POLICE_STATION,
    NEED_SEAPORT: () => NEED_SEAPORT,
    NEED_STADIUM: () => NEED_STADIUM,
    NOT_ENOUGH_POWER: () => NOT_ENOUGH_POWER,
    NO_MONEY: () => NO_MONEY,
    NUCLEAR_MELTDOWN: () => NUCLEAR_MELTDOWN,
    PLANE_CRASHED: () => PLANE_CRASHED,
    POLICE_NEEDS_FUNDING: () => POLICE_NEEDS_FUNDING,
    POPULATION_UPDATED: () => POPULATION_UPDATED,
    QUERY_WINDOW_CLOSED: () => QUERY_WINDOW_CLOSED,
    QUERY_WINDOW_NEEDED: () => QUERY_WINDOW_NEEDED,
    REACHED_CAPITAL: () => REACHED_CAPITAL,
    REACHED_CITY: () => REACHED_CITY,
    REACHED_MEGALOPOLIS: () => REACHED_MEGALOPOLIS,
    REACHED_METROPOLIS: () => REACHED_METROPOLIS,
    REACHED_TOWN: () => REACHED_TOWN,
    REACHED_VILLAGE: () => REACHED_VILLAGE,
    ROAD_NEEDS_FUNDING: () => ROAD_NEEDS_FUNDING,
    SAVE_REQUESTED: () => SAVE_REQUESTED,
    SAVE_WINDOW_CLOSED: () => SAVE_WINDOW_CLOSED,
    SCORE_UPDATED: () => SCORE_UPDATED,
    SCREENSHOT_LINK_CLOSED: () => SCREENSHOT_LINK_CLOSED,
    SCREENSHOT_WINDOW_CLOSED: () => SCREENSHOT_WINDOW_CLOSED,
    SCREENSHOT_WINDOW_REQUESTED: () => SCREENSHOT_WINDOW_REQUESTED,
    SETTINGS_WINDOW_CLOSED: () => SETTINGS_WINDOW_CLOSED,
    SETTINGS_WINDOW_REQUESTED: () => SETTINGS_WINDOW_REQUESTED,
    SHIP_CRASHED: () => SHIP_CRASHED,
    SOUND_EXPLOSIONHIGH: () => SOUND_EXPLOSIONHIGH,
    SOUND_EXPLOSIONLOW: () => SOUND_EXPLOSIONLOW,
    SOUND_HEAVY_TRAFFIC: () => SOUND_HEAVY_TRAFFIC,
    SOUND_HONKHONK: () => SOUND_HONKHONK,
    SOUND_MONSTER: () => SOUND_MONSTER,
    SPEED_CHANGE: () => SPEED_CHANGE,
    SPRITE_DYING: () => SPRITE_DYING,
    SPRITE_MOVED: () => SPRITE_MOVED,
    TAX_TOO_HIGH: () => TAX_TOO_HIGH,
    TOOL_CLICKED: () => TOOL_CLICKED,
    TORNADO_SIGHTED: () => TORNADO_SIGHTED,
    TOUCH_WINDOW_CLOSED: () => TOUCH_WINDOW_CLOSED,
    TRAFFIC_JAMS: () => TRAFFIC_JAMS,
    TRAIN_CRASHED: () => TRAIN_CRASHED,
    VALVES_UPDATED: () => VALVES_UPDATED,
    WELCOME: () => WELCOME
  });
  var AUTOBUDGET_CHANGED = "Autobudget changed";
  var BUDGET_NEEDED = "User needs to budget";
  var BUDGET_REQUESTED = "Budget window requested";
  var BUDGET_WINDOW_CLOSED = "Budget window closed";
  var BLACKOUTS_REPORTED = "Blackouts reported";
  var CLASSIFICATION_UPDATED = "Classification updated";
  var CONGRATS_SHOWING = "Congratulations showing";
  var CONGRATS_WINDOW_CLOSED = "Congratulations window closed";
  var DATE_UPDATED = "Date changed";
  var DEBUG_WINDOW_REQUESTED = "Debug Window Requested";
  var DEBUG_WINDOW_CLOSED = "Debug Window Closed";
  var DISASTER_REQUESTED = "Disaster Requested";
  var DISASTER_WINDOW_CLOSED = "Disaster window closed";
  var EARTHQUAKE = "Earthquake";
  var EVAL_REQUESTED = "Evaluation Requested";
  var EVAL_UPDATED = "Evaluation Updated";
  var EVAL_WINDOW_CLOSED = "Eval window closed";
  var EXPLOSION_REPORTED = "Explosion Reported";
  var FIRE_REPORTED = "Fire!";
  var FIRE_STATION_NEEDS_FUNDING = "Fire station needs funding";
  var FLOODING_REPORTED = "Flooding reported";
  var FRONT_END_MESSAGE = "Front-end Message";
  var FUNDS_CHANGED = "Total funds has changed";
  var HEAVY_TRAFFIC = "Total funds has changed";
  var HELICOPTER_CRASHED = "Helicopter crashed";
  var HIGH_CRIME = "High crime";
  var HIGH_POLLUTION = "High pollution";
  var MONSTER_SIGHTED = "Monster sighted";
  var NAG_WINDOW_CLOSED = "Nag window closed";
  var NEED_AIRPORT = "Airport needed";
  var NEED_ELECTRICITY = "More power needed";
  var NEED_FIRE_STATION = "Fire station needed";
  var NEED_MORE_COMMERCIAL = "More commercial zones needed";
  var NEED_MORE_INDUSTRIAL = "More industrial zones needed";
  var NEED_MORE_RAILS = "More railways needed";
  var NEED_MORE_RESIDENTIAL = "More residential needed";
  var NEED_MORE_ROADS = "More roads needed";
  var NEED_POLICE_STATION = "Police station needed";
  var NEED_SEAPORT = "Seaport needed";
  var NEED_STADIUM = "Stadium needed";
  var NO_MONEY = "No money";
  var NOT_ENOUGH_POWER = "Not enough power";
  var NUCLEAR_MELTDOWN = "Nuclear Meltdown";
  var PLANE_CRASHED = "Plane crashed";
  var POLICE_NEEDS_FUNDING = "Police need funding";
  var POPULATION_UPDATED = "Population updated";
  var QUERY_WINDOW_CLOSED = "Query window closed";
  var QUERY_WINDOW_NEEDED = "Query window needed";
  var REACHED_CAPITAL = "Now a capital";
  var REACHED_CITY = "Now a city";
  var REACHED_METROPOLIS = "Now a metropolis";
  var REACHED_MEGALOPOLIS = "Now a megalopolis";
  var REACHED_TOWN = "Now a town";
  var REACHED_VILLAGE = "Now a village";
  var ROAD_NEEDS_FUNDING = "Roads need funding";
  var SAVE_REQUESTED = "Save requested";
  var SAVE_WINDOW_CLOSED = "Save window closed";
  var SCORE_UPDATED = "Scoe updated";
  var SCREENSHOT_LINK_CLOSED = "Screenshot link closed";
  var SCREENSHOT_WINDOW_CLOSED = "Screenshot window closed";
  var SCREENSHOT_WINDOW_REQUESTED = "Screenshot window requested";
  var SETTINGS_WINDOW_CLOSED = "Settings window closed";
  var SETTINGS_WINDOW_REQUESTED = "Settings window requested";
  var SHIP_CRASHED = "Shipwrecked";
  var SOUND_EXPLOSIONHIGH = "Explosion! Bang!";
  var SOUND_EXPLOSIONLOW = "Explosion! Bang!";
  var SOUND_HEAVY_TRAFFIC = "Heavy Traffic sound";
  var SOUND_HONKHONK = "HonkHonk sound";
  var SOUND_MONSTER = "Monster sound";
  var SPEED_CHANGE = "Speed change";
  var SPRITE_DYING = "Sprite dying";
  var SPRITE_MOVED = "Sprite move";
  var TAX_TOO_HIGH = "Tax too high";
  var TOOL_CLICKED = "Tool clicked";
  var TORNADO_SIGHTED = "Tornado sighted";
  var TOUCH_WINDOW_CLOSED = "Touch Window closed";
  var TRAFFIC_JAMS = "Traffic jams reported";
  var TRAIN_CRASHED = "Train crashed";
  var VALVES_UPDATED = "Valves updated";
  var WELCOME = "Welcome to micropolisJS";
  var DISASTER_MESSAGES = [
    EARTHQUAKE,
    EXPLOSION_REPORTED,
    FIRE_REPORTED,
    FLOODING_REPORTED,
    MONSTER_SIGHTED,
    NUCLEAR_MELTDOWN,
    TORNADO_SIGHTED
  ];
  var CRASHES = [
    HELICOPTER_CRASHED,
    PLANE_CRASHED,
    SHIP_CRASHED,
    TRAIN_CRASHED
  ];

  // external/micropolisjs/src/zoneUtils.js
  var checkBigZone = function(tileValue) {
    var result;
    switch (tileValue) {
      case POWERPLANT:
      case PORT:
      case NUCLEAR:
      case STADIUM:
        result = { zoneSize: 4, deltaX: 0, deltaY: 0 };
        break;
      case POWERPLANT + 1:
      case COALSMOKE3:
      case COALSMOKE3 + 1:
      case COALSMOKE3 + 2:
      case PORT + 1:
      case NUCLEAR + 1:
      case STADIUM + 1:
        result = { zoneSize: 4, deltaX: -1, deltaY: 0 };
        break;
      case POWERPLANT + 4:
      case PORT + 4:
      case NUCLEAR + 4:
      case STADIUM + 4:
        result = { zoneSize: 4, deltaX: 0, deltaY: -1 };
        break;
      case POWERPLANT + 5:
      case PORT + 5:
      case NUCLEAR + 5:
      case STADIUM + 5:
        result = { zoneSize: 4, deltaX: -1, deltaY: -1 };
        break;
      case AIRPORT:
        result = { zoneSize: 6, deltaX: 0, deltaY: 0 };
        break;
      case AIRPORT + 1:
        result = { zoneSize: 6, deltaX: -1, deltaY: 0 };
        break;
      case AIRPORT + 2:
        result = { zoneSize: 6, deltaX: -2, deltaY: 0 };
        break;
      case AIRPORT + 3:
        result = { zoneSize: 6, deltaX: -3, deltaY: 0 };
        break;
      case AIRPORT + 6:
        result = { zoneSize: 6, deltaX: 0, deltaY: -1 };
        break;
      case AIRPORT + 7:
        result = { zoneSize: 6, deltaX: -1, deltaY: -1 };
        break;
      case AIRPORT + 8:
        result = { zoneSize: 6, deltaX: -2, deltaY: -1 };
        break;
      case AIRPORT + 9:
        result = { zoneSize: 6, deltaX: -3, deltaY: -1 };
        break;
      case AIRPORT + 12:
        result = { zoneSize: 6, deltaX: 0, deltaY: -2 };
        break;
      case AIRPORT + 13:
        result = { zoneSize: 6, deltaX: -1, deltaY: -2 };
        break;
      case AIRPORT + 14:
        result = { zoneSize: 6, deltaX: -2, deltaY: -2 };
        break;
      case AIRPORT + 15:
        result = { zoneSize: 6, deltaX: -3, deltaY: -2 };
        break;
      case AIRPORT + 18:
        result = { zoneSize: 6, deltaX: 0, deltaY: -3 };
        break;
      case AIRPORT + 19:
        result = { zoneSize: 6, deltaX: -1, deltaY: -3 };
        break;
      case AIRPORT + 20:
        result = { zoneSize: 6, deltaX: -2, deltaY: -3 };
        break;
      case AIRPORT + 21:
        result = { zoneSize: 6, deltaX: -3, deltaY: -3 };
        break;
      default:
        result = { zoneSize: 0, deltaX: 0, deltaY: 0 };
        break;
    }
    return result;
  };
  var checkZoneSize = function(tileValue) {
    if (tileValue >= RESBASE - 1 && tileValue <= PORTBASE - 1 || tileValue >= LASTPOWERPLANT + 1 && tileValue <= POLICESTATION + 4 || tileValue >= CHURCH1BASE && tileValue <= CHURCH7LAST) {
      return 3;
    }
    if (tileValue >= PORTBASE && tileValue <= LASTPORT || tileValue >= COALBASE && tileValue <= LASTPOWERPLANT || tileValue >= STADIUMBASE && tileValue <= LASTZONE) {
      return 4;
    }
    return 0;
  };
  var fireZone = function(map, x, y, blockMaps) {
    var tileValue = map.getTileValue(x, y);
    var zoneSize = 2;
    var value = blockMaps.rateOfGrowthMap.worldGet(x, y);
    value = MiscUtils.clamp(value - 20, -200, 200);
    blockMaps.rateOfGrowthMap.worldSet(x, y, value);
    if (tileValue === AIRPORT)
      zoneSize = 5;
    else if (tileValue >= PORTBASE)
      zoneSize = 3;
    else if (tileValue < PORTBASE)
      zoneSize = 2;
    for (var xDelta9 = -1; xDelta9 < zoneSize; xDelta9++) {
      for (var yDelta9 = -1; yDelta9 < zoneSize; yDelta9++) {
        var xTem = x + xDelta9;
        var yTem = y + yDelta9;
        if (!map.testBounds(xTem, yTem))
          continue;
        if (map.getTileValue(xTem, yTem >= ROADBASE))
          map.addTileFlags(xTem, yTem, BULLBIT);
      }
    }
  };
  var getLandPollutionValue = function(blockMaps, x, y) {
    var landValue = blockMaps.landValueMap.worldGet(x, y);
    landValue -= blockMaps.pollutionDensityMap.worldGet(x, y);
    if (landValue < 30)
      return 0;
    if (landValue < 80)
      return 1;
    if (landValue < 150)
      return 2;
    return 3;
  };
  var incRateOfGrowth = function(blockMaps, x, y, growthDelta) {
    var currentRate = blockMaps.rateOfGrowthMap.worldGet(x, y);
    var newValue = MiscUtils.clamp(currentRate + growthDelta * 4, -200, 200);
    blockMaps.rateOfGrowthMap.worldSet(x, y, newValue);
  };
  var putZone = function(map, x, y, centreTile, isPowered) {
    for (var dY = -1; dY < 2; dY++) {
      for (var dX = -1; dX < 2; dX++) {
        var tileValue = map.getTileValue(x + dX, y + dY);
        if (tileValue >= FLOOD && tileValue < ROADBASE)
          return;
      }
    }
    map.putZone(x, y, centreTile, 3);
    map.addTileFlags(x, y, BULLBIT);
    if (isPowered)
      map.addTileFlags(x, y, POWERBIT);
  };
  var ZoneUtils = {
    checkBigZone,
    checkZoneSize,
    fireZone,
    getLandPollutionValue,
    incRateOfGrowth,
    putZone
  };

  // external/micropolisjs/src/bulldozerTool.js
  var BulldozerTool = EventEmitter(ConnectingTool(function(map) {
    this.init(10, map, true);
  }));
  BulldozerTool.prototype.putRubble = function(x, y, size) {
    for (var xx = x; xx < x + size; xx++) {
      for (var yy = y; yy < y + size; yy++) {
        if (this._map.testBounds(xx, yy)) {
          var tile3 = this._worldEffects.getTileValue(xx, yy);
          if (tile3 != RADTILE && tile3 != DIRT)
            this._worldEffects.setTile(xx, yy, TINYEXP + Random.getRandom(2), ANIMBIT | BULLBIT);
        }
      }
    }
  };
  BulldozerTool.prototype.layDoze = function(x, y) {
    var tile3 = this._worldEffects.getTile(x, y);
    if (!tile3.isBulldozable())
      return this.TOOLRESULT_FAILED;
    tile3 = tile3.getValue();
    tile3 = TileUtils.normalizeRoad(tile3);
    switch (tile3) {
      case HBRIDGE:
      case VBRIDGE:
      case BRWV:
      case BRWH:
      case HBRDG0:
      case HBRDG1:
      case HBRDG2:
      case HBRDG3:
      case VBRDG0:
      case VBRDG1:
      case VBRDG2:
      case VBRDG3:
      case HPOWER:
      case VPOWER:
      case HRAIL:
      case VRAIL:
        this._worldEffects.setTile(x, y, RIVER);
        break;
      default:
        this._worldEffects.setTile(x, y, DIRT);
        break;
    }
    this.addCost(1);
    return this.TOOLRESULT_OK;
  };
  BulldozerTool.prototype.doTool = function(x, y, blockMaps) {
    if (!this._map.testBounds(x, y))
      this.result = this.TOOLRESULT_FAILED;
    var tile3 = this._worldEffects.getTile(x, y);
    var tileValue = tile3.getValue();
    var zoneSize = 0;
    var deltaX;
    var deltaY;
    if (tile3.isZone()) {
      zoneSize = ZoneUtils.checkZoneSize(tileValue);
      deltaX = 0;
      deltaY = 0;
    } else {
      var result = ZoneUtils.checkBigZone(tileValue);
      zoneSize = result.zoneSize;
      deltaX = result.deltaX;
      deltaY = result.deltaY;
    }
    if (zoneSize > 0) {
      this.addCost(this.bulldozerCost);
      var dozeX = x;
      var dozeY = y;
      var centerX = x + deltaX;
      var centerY = y + deltaY;
      switch (zoneSize) {
        case 3:
          this._emitEvent(SOUND_EXPLOSIONHIGH);
          this.putRubble(centerX - 1, centerY - 1, 3);
          break;
        case 4:
          this._emitEvent(SOUND_EXPLOSIONLOW);
          this.putRubble(centerX - 1, centerY - 1, 4);
          break;
        case 6:
          this._emitEvent(SOUND_EXPLOSIONHIGH);
          this._emitEvent(SOUND_EXPLOSIONLOW);
          this.putRubble(centerX - 1, centerY - 1, 6);
          break;
      }
      this.result = this.TOOLRESULT_OK;
    } else {
      var toolResult;
      if (tileValue === RIVER || tileValue === REDGE || tileValue === CHANNEL) {
        toolResult = this.layDoze(x, y);
        if (tileValue !== this._worldEffects.getTileValue(x, y))
          this.addCost(5);
      } else {
        toolResult = this.layDoze(x, y);
        this.checkZoneConnections(x, y);
      }
      this.result = toolResult;
    }
  };

  // tooling/vendor/jquery-shim.mjs
  function jqueryForbidden() {
    throw new Error(
      "jQuery reached the Micropolis engine bundle. Pass DOM elements, not selectors; UI belongs to app/features/micropolis.js."
    );
  }
  var jquery_shim_default = jqueryForbidden;

  // external/micropolisjs/src/direction.ts
  var DirectionValue = class {
    constructor(name) {
      this.name = name;
    }
    oppositeDirection() {
      return this.transform(4);
    }
    rotateClockwise() {
      return this.transform(1);
    }
    rotateCounterClockwise() {
      return this.transform(allDirections.length - 1);
    }
    toString() {
      return this.name;
    }
    transform(delta) {
      const ourIndex = directionIndex(this);
      const desired = ourIndex + delta;
      return allDirections[desired % allDirections.length];
    }
  };
  var NORTH = Object.freeze(new DirectionValue("NORTH"));
  var NORTHEAST = Object.freeze(new DirectionValue("NORTHEAST"));
  var EAST = Object.freeze(new DirectionValue("EAST"));
  var SOUTHEAST = Object.freeze(new DirectionValue("SOUTHEAST"));
  var SOUTH = Object.freeze(new DirectionValue("SOUTH"));
  var SOUTHWEST = Object.freeze(new DirectionValue("SOUTHWEST"));
  var WEST = Object.freeze(new DirectionValue("WEST"));
  var NORTHWEST = Object.freeze(new DirectionValue("NORTHWEST"));
  var allDirections = [
    NORTH,
    NORTHEAST,
    EAST,
    SOUTHEAST,
    SOUTH,
    SOUTHWEST,
    WEST,
    NORTHWEST
  ];
  function directionIndex(direction) {
    return allDirections.indexOf(direction);
  }
  var cardinalDirections = [
    NORTH,
    EAST,
    SOUTH,
    WEST
  ];
  function forEachCardinalDirection(callback) {
    cardinalDirections.forEach((dir) => callback(dir));
  }
  function getRandomCardinalDirection() {
    return getRandomDirectionFrom(cardinalDirections);
  }
  function getRandomDirection() {
    return getRandomDirectionFrom(allDirections);
  }
  function getRandomDirectionFrom(directionArray) {
    const maxIndex = directionArray.length - 1;
    const index = Random.getRandom(maxIndex);
    return directionArray[index];
  }

  // external/micropolisjs/src/position.ts
  var DirectionDelta = class {
    constructor(xDelta9, yDelta9) {
      this.xDelta = xDelta9;
      this.yDelta = yDelta9;
    }
  };
  function getDeltaFor(direction) {
    switch (direction) {
      case NORTH:
        return new DirectionDelta(0, -1);
      case NORTHEAST:
        return new DirectionDelta(1, -1);
      case EAST:
        return new DirectionDelta(1, 0);
      case SOUTHEAST:
        return new DirectionDelta(1, 1);
      case SOUTH:
        return new DirectionDelta(0, 1);
      case SOUTHWEST:
        return new DirectionDelta(-1, 1);
      case WEST:
        return new DirectionDelta(-1, 0);
      case NORTHWEST:
        return new DirectionDelta(-1, -1);
      default:
        throw new Error(`Unexpected direction!`);
    }
  }
  var Position = class _Position {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
    static move(position, direction) {
      const { x, y } = position;
      const { xDelta: xDelta9, yDelta: yDelta9 } = getDeltaFor(direction);
      return new _Position(x + xDelta9, y + yDelta9);
    }
    static origin() {
      return new _Position(0, 0);
    }
    toString() {
      return `(${this.x}, ${this.y})`;
    }
  };

  // external/micropolisjs/src/bounds.ts
  var Bounds = class _Bounds {
    constructor(inclusiveStartX, inclusiveStartY, widthCount, heightCount) {
      this.inclusiveStartX = inclusiveStartX;
      this.inclusiveStartY = inclusiveStartY;
      this.exclusiveEndX = inclusiveStartX + widthCount;
      this.exclusiveEndY = inclusiveStartY + heightCount;
    }
    static fromOrigin(width2, height2) {
      return new _Bounds(0, 0, width2, height2);
    }
    contains(position) {
      const { x, y } = position;
      return this.xInBounds(x) && this.yInBounds(y);
    }
    toString() {
      const upperCorner = new Position(this.inclusiveStartX, this.inclusiveStartY);
      const lowerCorner = new Position(this.exclusiveEndX - 1, this.exclusiveEndY - 1);
      return `Bounds Rectangle: ${upperCorner} - ${lowerCorner}`;
    }
    xInBounds(x) {
      return x >= this.inclusiveStartX && x < this.exclusiveEndX;
    }
    yInBounds(y) {
      return y >= this.inclusiveStartY && y < this.exclusiveEndY;
    }
  };

  // external/micropolisjs/src/gameMap.js
  function GameMap(width2, height2, defaultValue) {
    if (!(this instanceof GameMap))
      return new GameMap(width2, height2, defaultValue);
    if (arguments.length > 1 && typeof width2 === "number" && (width2 < 1 || height2 < 1))
      throw new Error("GameMap constructor called with invalid width or height " + width2 + " " + height2);
    if (arguments.length === 0) {
      width2 = 120;
      height2 = 100;
      defaultValue = new Tile().getValue();
    } else if (arguments.length === 1) {
      if (typeof width2 === "number") {
        defaultValue = width2;
      } else {
        defaultValue = width2.getValue();
      }
      width2 = 120;
      height2 = 100;
    } else if (arguments.length === 2) {
      defaultValue = new Tile().getValue();
    } else if (arguments.length === 3) {
      if (typeof defaultValue === "object")
        defaultValue = defaultValue.getValue();
    }
    this.width = width2;
    this.height = height2;
    this.bounds = Bounds.fromOrigin(width2, height2);
    var data = [];
    for (var i = 0, l = width2 * height2; i < l; i++)
      data[i] = new Tile(defaultValue);
    this._data = data;
    this.cityCentreX = Math.floor(this.width / 2);
    this.cityCentreY = Math.floor(this.height / 2);
    this.pollutionMaxX = this.cityCentreX;
    this.pollutionMaxY = this.cityCentreY;
  }
  var saveProps = ["cityCentreX", "cityCentreY", "pollutionMaxX", "pollutionMaxY", "width", "height"];
  GameMap.prototype.save = function(saveData) {
    for (var i = 0, l = saveProps.length; i < l; i++)
      saveData[saveProps[i]] = this[saveProps[i]];
    saveData.map = this._data.map(function(t) {
      return { value: t.getRawValue() };
    });
  };
  GameMap.prototype.load = function(saveData) {
    for (var i = 0, l = saveProps.length; i < l; i++)
      this[saveProps[i]] = saveData[saveProps[i]];
    var map = saveData.map;
    for (i = 0, l = map.length; i < l; i++)
      this.setTileValue(i % this.width, Math.floor(i / this.width), map[i].value);
  };
  GameMap.prototype._calculateIndex = function(x, y) {
    return x + y * this.width;
  };
  GameMap.prototype.isPositionInBounds = function(pos2) {
    return this.bounds.contains(pos2);
  };
  GameMap.prototype.testBounds = function(x, y) {
    return this.isPositionInBounds(new Position(x, y));
  };
  GameMap.prototype.getTile = function(x, y, newTile) {
    if (typeof x === "object") {
      y = x.y;
      x = x.x;
    }
    var width2 = this.width;
    var height2 = this.height;
    if (x < 0 || y < 0 || x >= width2 || y >= height2) {
      console.warn("getTile called with bad bounds", x, y);
      return new Tile(TILE_INVALID2);
    }
    var tileIndex = x + y * width2;
    var tile3 = this._data[tileIndex];
    if (!newTile)
      return tile3;
    newTile.setFrom(tile3);
    return tile3;
  };
  GameMap.prototype.getTileValue = function(x, y) {
    if (arguments.length < 1)
      throw new Error("GameMap getTileValue called with too few arguments" + [].toString.apply(arguments));
    if (typeof x === "object") {
      y = x.y;
      x = x.x;
    }
    if (!this.testBounds(x, y))
      throw new Error("GameMap getTileValue called with invalid bounds " + x + ", " + y);
    var tileIndex = this._calculateIndex(x, y);
    return this._data[tileIndex].getValue();
  };
  GameMap.prototype.getTileFlags = function(x, y) {
    if (arguments.length < 1)
      throw new Error("GameMap getTileFlags called with too few arguments" + [].toString.apply(arguments));
    if (typeof x === "object") {
      y = x.y;
      x = x.x;
    }
    if (!this.testBounds(x, y))
      throw new Error("GameMap getTileFlags called with invalid bounds " + x + ", " + y);
    var tileIndex = this._calculateIndex(x, y);
    return this._data[tileIndex].getFlags();
  };
  GameMap.prototype.getTiles = function(x, y, w, h) {
    if (arguments.length < 3)
      throw new Error("GameMap getTiles called with too few arguments" + [].toString.apply(arguments));
    if (arguments.length === 3) {
      h = w;
      w = y;
      y = x.y;
      x = x.x;
    }
    if (!this.testBounds(x, y))
      throw new Error("GameMap getTiles called with invalid bounds " + x + ", " + y);
    var res = [];
    for (var a = y, ylim = y + h; a < ylim; a++) {
      res[a - y] = [];
      for (var b = x, xlim = x + w; b < xlim; b++) {
        var tileIndex = this._calculateIndex(b, a);
        res[a - y].push(this._data[tileIndex]);
      }
    }
    return res;
  };
  GameMap.prototype.getTileValuesForPainting = function(x, y, w, h, result) {
    result = result || [];
    if (arguments.length < 3)
      throw new Error("GameMap getTileValuesForPainting called with too few arguments" + [].toString.apply(arguments));
    if (arguments.length === 3) {
      h = w;
      w = y;
      y = x.y;
      x = x.x;
    }
    var width2 = this.width;
    var height2 = this.height;
    for (var a = y, ylim = y + h; a < ylim; a++) {
      for (var b = x, xlim = x + w; b < xlim; b++) {
        if (a < 0 || b < 0 || a >= height2 || b >= width2) {
          result[(a - y) * w + (b - x)] = TILE_INVALID2;
          continue;
        }
        var tileIndex = b + a * width2;
        result[(a - y) * w + (b - x)] = this._data[tileIndex].getRawValue();
      }
    }
    return result;
  };
  GameMap.prototype.getTileFromMapOrDefault = function(pos2, dir, defaultTile) {
    switch (dir) {
      case NORTH:
        if (pos2.y > 0)
          return this.getTileValue(pos2.x, pos2.y - 1);
        return defaultTile;
      case EAST:
        if (pos2.x < this.width - 1)
          return this.getTileValue(pos2.x + 1, pos2.y);
        return defaultTile;
      case SOUTH:
        if (pos2.y < this.height - 1)
          return this.getTileValue(pos2.x, pos2.y + 1);
        return defaultTile;
      case WEST:
        if (pos2.x > 0)
          return this.getTileValue(pos2.x - 1, pos2.y);
        return defaultTile;
      default:
        return defaultTile;
    }
  };
  GameMap.prototype.setTile = function(x, y, value, flags) {
    if (arguments.length < 3)
      throw new Error("GameMap setTile called with too few arguments" + [].toString.apply(arguments));
    if (arguments.length === 3) {
      flags = value;
      value = y;
      y = x.y;
      x = x.x;
    }
    if (!this.testBounds(x, y))
      throw new Error("GameMap setTile called with invalid bounds " + x + ", " + y);
    var tileIndex = this._calculateIndex(x, y);
    this._data[tileIndex].set(value, flags);
  };
  GameMap.prototype.setTo = function(x, y, tile3) {
    if (arguments.length < 2)
      throw new Error("GameMap setTo called with too few arguments" + [].toString.apply(arguments));
    if (tile3 === void 0) {
      tile3 = y;
      y = x.y;
      x = x.x;
    }
    if (!this.testBounds(x, y))
      throw new Error("GameMap setTo called with invalid bounds " + x + ", " + y);
    var tileIndex = this._calculateIndex(x, y);
    this._data[tileIndex] = tile3;
  };
  GameMap.prototype.setTileValue = function(x, y, value) {
    if (arguments.length < 2)
      throw new Error("GameMap setTileValue called with too few arguments" + [].toString.apply(arguments));
    if (arguments.length === 2) {
      value = y;
      y = x.y;
      x = x.x;
    }
    if (!this.testBounds(x, y))
      throw new Error("GameMap setTileValue called with invalid bounds " + x + ", " + y);
    var tileIndex = this._calculateIndex(x, y);
    this._data[tileIndex].setValue(value);
  };
  GameMap.prototype.setTileFlags = function(x, y, flags) {
    if (arguments.length < 2)
      throw new Error("GameMap setTileFlags called with too few arguments" + [].toString.apply(arguments));
    if (arguments.length === 2) {
      flags = y;
      y = x.y;
      x = x.x;
    }
    if (!this.testBounds(x, y))
      throw new Error("GameMap setTileFlags called with invalid bounds " + x + ", " + y);
    var tileIndex = this._calculateIndex(x, y);
    this._data[tileIndex].setFlags(flags);
  };
  GameMap.prototype.addTileFlags = function(x, y, flags) {
    if (arguments.length < 2)
      throw new Error("GameMap addTileFlags called with too few arguments" + [].toString.apply(arguments));
    if (arguments.length === 2) {
      flags = y;
      y = x.y;
      x = x.x;
    }
    if (!this.testBounds(x, y))
      throw new Error("GameMap addTileFlags called with invalid bounds " + x + ", " + y);
    var tileIndex = this._calculateIndex(x, y);
    this._data[tileIndex].addFlags(flags);
  };
  GameMap.prototype.removeTileFlags = function(x, y, flags) {
    if (arguments.length < 2)
      throw new Error("GameMap removeTileFlags called with too few arguments" + [].toString.apply(arguments));
    if (arguments.length === 2) {
      flags = y;
      y = x.y;
      x = x.x;
    }
    if (!this.testBounds(x, y))
      throw new Error("GameMap removeTileFlags called with invalid bounds " + x + ", " + y);
    var tileIndex = this._calculateIndex(x, y);
    this._data[tileIndex].removeFlags(flags);
  };
  GameMap.prototype.putZone = function(centreX, centreY, centreTile, size) {
    var x, y;
    if (!this.testBounds(centreX, centreY) || !this.testBounds(centreX - 1 + size - 1, centreY - 1 + size - 1))
      throw new Error("GameMap putZone called with invalid bounds " + x + ", " + y);
    var tile3 = centreTile - 1 - size;
    var startX = centreX - 1;
    var startY = centreY - 1;
    for (y = startY; y < startY + size; y++) {
      for (x = startX; x < startX + size; x++) {
        if (x === centreX && y === centreY)
          this.setTo(x, y, new Tile(tile3, BNCNBIT | ZONEBIT));
        else
          this.setTo(x, y, new Tile(tile3, BNCNBIT));
        tile3 += 1;
      }
    }
  };

  // external/micropolisjs/src/mouseBox.js
  var MouseBox = {
    draw: function(c, pos2, width2, height2, options) {
      var lineWidth = options.lineWidth || 3;
      var strokeStyle = options.colour || "yellow";
      var shouldOutline = "outline" in options && options.outline === true || false;
      var startModifier = -1;
      var endModifier = 1;
      if (!shouldOutline) {
        startModifier = 1;
        endModifier = -1;
      }
      var startX = pos2.x + startModifier * lineWidth / 2;
      width2 = width2 + endModifier * lineWidth;
      var startY = pos2.y + startModifier * lineWidth / 2;
      height2 = height2 + endModifier * lineWidth;
      var ctx = c.getContext("2d");
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeStyle;
      ctx.strokeRect(startX, startY, width2, height2);
    }
  };

  // external/micropolisjs/src/tileSet.js
  var TILE_SIZE = 16;
  var TILES_PER_ROW = Math.sqrt(TILE_COUNT);
  var ACCEPTABLE_DIMENSION = TILES_PER_ROW * TILE_SIZE;
  function TileSet(image, callback, errorCallback) {
    if (!(this instanceof TileSet))
      return new TileSet(image, callback, errorCallback);
    if (callback === void 0 || errorCallback === void 0) {
      if (callback === void 0 && errorCallback === void 0)
        throw new Error("Tileset constructor called with no callback or errorCallback");
      else
        throw new Error("Tileset constructor called with no " + (callback === void 0 ? "callback" : "errorCallback"));
    }
    this.isValid = false;
    if (!(image instanceof Image)) {
      window.setTimeout(errorCallback, 0);
      return;
    }
    this._verifyImage(image, callback, errorCallback);
  }
  TileSet.prototype._verifyImage = function(image, callback, errorCallback) {
    var width2 = image.width;
    var height2 = image.height;
    var scale = width2 / ACCEPTABLE_DIMENSION;
    if (width2 !== height2 || !(scale >= 1) || Math.floor(scale) !== scale) {
      window.setTimeout(errorCallback, 0);
      return;
    }
    this.scale = scale;
    var tileWidth = this.tileWidth = TILE_SIZE * scale;
    var c = document.createElement("canvas");
    c.width = tileWidth;
    c.height = tileWidth;
    var cx = c.getContext("2d");
    var tileCount = TILE_COUNT;
    var notifications = 0;
    var self = this;
    var imageLoad = function() {
      notifications++;
      if (notifications === tileCount) {
        self.isValid = true;
        window.setTimeout(callback, 0);
        return;
      }
    };
    for (var i = 0; i < tileCount; i++) {
      cx.clearRect(0, 0, tileWidth, tileWidth);
      var sourceX = i % TILES_PER_ROW * tileWidth;
      var sourceY = Math.floor(i / TILES_PER_ROW) * tileWidth;
      cx.drawImage(image, sourceX, sourceY, tileWidth, tileWidth, 0, 0, tileWidth, tileWidth);
      this[i] = new Image();
      this[i].onload = imageLoad;
      this[i].src = c.toDataURL();
    }
  };

  // external/micropolisjs/src/gameCanvas.js
  function GameCanvas(id, parentNode) {
    if (!(this instanceof GameCanvas))
      return new GameCanvas(id, parentNode, width, height);
    if (arguments.length < 1)
      throw new Error("Attempt to construct a GameCanvas with no parameters");
    if (parentNode === void 0) {
      parentNode = id;
      id = GameCanvas.DEFAULT_ID;
    }
    if (typeof parentNode === "string") {
      var orig = parentNode;
      parentNode = jquery_shim_default(MiscUtils.normaliseDOMid(parentNode));
      parentNode = parentNode.length === 0 ? null : parentNode[0];
      if (parentNode === null)
        throw new Error("Node " + orig + " not found");
    }
    this._canvas = document.createElement("canvas");
    this._canvas.id = id;
    var rect = parentNode.getBoundingClientRect();
    this._canvas.width = rect.width;
    this._canvas.height = rect.height;
    this._canvas.style.margin = "0";
    this._canvas.style.padding = "0";
    this._pendingTileSet = null;
    var current = document.getElementById(id);
    if (current !== null) {
      if (current.parentNode === parentNode)
        parentNode.replaceChild(this._canvas, current);
      else
        throw new Error("ID " + id + " already exists in document!");
    } else
      parentNode.appendChild(this._canvas);
    this.ready = false;
  }
  GameCanvas.prototype.init = function(map, tileSet, spriteSheet, animationManager) {
    animationManager = animationManager || new AnimationManager(map);
    if (arguments.length < 3)
      throw new Error("GameCanvas constructor called with too few arguments " + [].toString.apply(arguments));
    if (!tileSet.isValid)
      throw new Error("TileSet not ready!");
    this._spriteSheet = spriteSheet;
    this._tileSet = tileSet;
    var w = this._tileSet.tileWidth;
    this._map = map;
    this.animationManager = new AnimationManager(map);
    if (this._canvas.width < w || this._canvas.height < w)
      throw new Error("Canvas too small!");
    this._allowScrolling = true;
    this._lastPaintedTiles = null;
    this._currentPaintedTiles = [];
    this._lastPaintedWidth = -1;
    this._lastPaintedHeight = -1;
    this._lastCanvasWidth = -1;
    this._lastCanvasHeight = -1;
    this._lastCanvasData = null;
    this._calculateDimensions();
    this._pendingDimensionChange = false;
    var onResize = (function(e2) {
      this._pendingDimensionChange = true;
    }).bind(this);
    window.addEventListener("resize", onResize, false);
    this.ready = true;
    this.centreOn(Math.floor(this._map.width / 2), Math.floor(this._map.height / 2));
    this.paint(null, null);
  };
  GameCanvas.prototype._calculateDimensions = function(force) {
    force = force || false;
    var scale = this._tileSet.scale || 1;
    var cssWidth = this._canvas.parentNode.clientWidth;
    var cssHeight = this._canvas.parentNode.clientHeight;
    var canvasWidth = this.canvasWidth = cssWidth * scale;
    var canvasHeight = this.canvasHeight = cssHeight * scale;
    if (canvasHeight === this._lastCanvasHeight && canvasWidth === this._lastCanvasWidth && !force)
      return;
    this._canvas.width = canvasWidth;
    this._canvas.height = canvasHeight;
    this._canvas.style.width = cssWidth + "px";
    this._canvas.style.height = cssHeight + "px";
    var w = this._tileSet.tileWidth;
    this._wholeTilesInViewX = Math.floor(canvasWidth / w);
    this._wholeTilesInViewY = Math.floor(canvasHeight / w);
    this._totalTilesInViewX = Math.ceil(canvasWidth / w);
    this._totalTilesInViewY = Math.ceil(canvasHeight / w);
    if (this._allowScrolling) {
      this.minX = 0 - Math.ceil(Math.floor(canvasWidth / w) / 2);
      this.maxX = this._map.width - 1 - Math.ceil(Math.floor(canvasWidth / w) / 2);
      this.minY = 0 - Math.ceil(Math.floor(canvasHeight / w) / 2);
      this.maxY = this._map.height - 1 - Math.ceil(Math.floor(canvasHeight / w) / 2);
      this._totalTilesInViewY = Math.ceil(canvasHeight / w);
    } else {
      this.minX = 0;
      this.minY = 0;
      this.maxX = this._map.width - this._totalTilesInViewX;
      this.maxY = this._map.height - this._totalTilesInViewY;
    }
    this._pendingDimensionChange = true;
  };
  GameCanvas.prototype.disallowOffMap = function() {
    this._allowScrolling = false;
    this._lastPaintedTiles = null;
    this._calculateDimensions(true);
  };
  GameCanvas.prototype.moveNorth = function() {
    if (!this.ready)
      throw new Error("Not ready!");
    if (this._originY > this.minY)
      this._originY--;
  };
  GameCanvas.prototype.moveEast = function() {
    if (!this.ready)
      throw new Error("Not ready!");
    if (this._originX < this.maxX)
      this._originX++;
  };
  GameCanvas.prototype.moveSouth = function() {
    if (!this.ready)
      throw new Error("Not ready!");
    if (this._originY < this.maxY)
      this._originY++;
  };
  GameCanvas.prototype.moveWest = function() {
    if (!this.ready)
      throw new Error("Not ready!");
    if (this._originX > this.minX)
      this._originX--;
  };
  GameCanvas.prototype.moveTo = function(x, y) {
    if (arguments.length < 1)
      throw new Error("GameCanvas moveTo called with no arguments");
    if (!this.ready)
      throw new Error("Not ready!");
    if (x < this.minX || x > this.maxX || y < this.minY || y > this.maxY)
      throw new Error("Coordinates out of bounds");
    this._originX = x;
    this._originY = y;
  };
  GameCanvas.prototype.centreOn = function(x, y) {
    if (arguments.length < 1)
      throw new Error("GameCanvas centreOn called with no arguments");
    if (!this.ready)
      throw new Error("Not ready!");
    if (y === void 0) {
      y = x.y;
      x = x.x;
    }
    var originX = Math.floor(x) - Math.ceil(this._wholeTilesInViewX / 2);
    var originY = Math.floor(y) - Math.ceil(this._wholeTilesInViewY / 2);
    if (originX > this.maxX)
      originX = this.maxX;
    if (originX < this.minX)
      originX = this.minX;
    if (originY > this.maxY)
      originY = this.maxY;
    if (originY < this.minY)
      originY = this.minY;
    this._originX = originX;
    this._originY = originY;
  };
  GameCanvas.prototype.getTileOrigin = function() {
    var e2 = new Error("Not ready!");
    if (!this.ready)
      throw e2;
    return { x: this._originX, y: this._originY };
  };
  GameCanvas.prototype.getMaxTile = function() {
    var e2 = new Error("Not ready!");
    if (!this.ready)
      throw e2;
    return { x: this._originX + this._totalTilesInViewX - 1, y: this._originY + this._totalTilesInViewY - 1 };
  };
  GameCanvas.prototype.canvasCoordinateToTileOffset = function(x, y) {
    if (arguments.length < 2)
      throw new Error("GameCanvas canvasCoordinateToTileOffset called with too few arguments " + [].toString.apply(arguments));
    if (!this.ready)
      throw new Error("Not ready!");
    var cssTileWidth = this._tileSet.tileWidth / (this._tileSet.scale || 1);
    return {
      x: Math.floor(x / cssTileWidth),
      y: Math.floor(y / cssTileWidth)
    };
  };
  GameCanvas.prototype.canvasCoordinateToTileCoordinate = function(x, y) {
    if (arguments.length < 2)
      throw new Error("GameCanvas canvasCoordinateToTileCoordinate called with too few arguments " + [].toString.apply(arguments));
    if (!this.ready)
      throw new Error("Not ready!");
    var scale = this._tileSet.scale || 1;
    if (x * scale >= this.canvasWidth || y * scale >= this.canvasHeight)
      return null;
    return {
      x: this._originX + Math.floor(x * scale / this._tileSet.tileWidth),
      y: this._originY + Math.floor(y * scale / this._tileSet.tileWidth)
    };
  };
  GameCanvas.prototype.canvasCoordinateToPosition = function(x, y) {
    if (arguments.length < 2)
      throw new Error("GameCanvas canvasCoordinateToPosition called with too few arguments " + [].toString.apply(arguments));
    if (!this.ready)
      throw new Error("Not ready!");
    var scale = this._tileSet.scale || 1;
    if (x * scale >= this.canvasWidth || y * scale >= this.canvasHeight)
      return null;
    x = this._originX + Math.floor(x * scale / this._tileSet.tileWidth);
    y = this._originY + Math.floor(y * scale / this._tileSet.tileWidth);
    if (x < 0 || x >= this._map.width || y < 0 || y >= this._map.height)
      return null;
    return new Position(x, y);
  };
  GameCanvas.prototype.positionToCanvasCoordinate = function(p) {
    if (arguments.length < 1)
      throw new Error("GameCanvas positionToCanvasCoordinate called with too few arguments " + [].toString.apply(arguments));
    return this.tileToCanvasCoordinate(p);
  };
  GameCanvas.prototype.tileToCanvasCoordinate = function(x, y) {
    if (arguments.length < 1)
      throw new Error("GameCanvas tileToCanvasCoordinate  called with too few arguments " + [].toString.apply(arguments));
    if (!this.ready)
      throw new Error("Not ready!");
    if (y === void 0) {
      y = x.y;
      x = x.x;
    }
    if (x === void 0 || y === void 0 || x < this.minX || y < this.minY || x > this.maxX + this._totalTilesInViewX - 1 || y > this.maxY + this._totalTilesInViewY - 1)
      throw e;
    if (x < this._originX || x >= this._originX + this._totalTilesInViewX || y < this._originY || y >= this._originY + this._totalTilesInViewY)
      return null;
    var cssTileWidth = this._tileSet.tileWidth / (this._tileSet.scale || 1);
    return {
      x: (x - this._originX) * cssTileWidth,
      y: (y - this._originY) * cssTileWidth
    };
  };
  GameCanvas.prototype.changeTileSet = function(tileSet) {
    if (!this.ready)
      throw new Error("Not ready!");
    if (!tileSet.isValid)
      throw new Error("new tileset not loaded");
    this._pendingTileSet = tileSet;
  };
  GameCanvas.prototype._screenshot = function(onlyVisible) {
    if (onlyVisible)
      return this._canvas.toDataURL();
    var tempCanvas = document.createElement("canvas");
    tempCanvas.width = this._map.width * this._tileSet.tileWidth;
    tempCanvas.height = this._map.height * this._tileSet.tileWidth;
    var ctx = tempCanvas.getContext("2d");
    for (var x = 0; x < this._map.width; x++) {
      for (var y = 0; y < this._map.height; y++) {
        this._paintOne(ctx, this._map.getTileValue(x, y), x, y);
      }
    }
    return tempCanvas.toDataURL();
  };
  GameCanvas.prototype.screenshotMap = function() {
    return this._screenshot(false);
  };
  GameCanvas.prototype.screenshotVisible = function() {
    return this._screenshot(true);
  };
  GameCanvas.prototype.shoogle = function() {
  };
  GameCanvas.prototype._processSprites = function(ctx, spriteList) {
    var spriteDamage = [];
    var scale = this._tileSet.scale || 1;
    var tileWidth = this._tileSet.tileWidth / scale;
    for (var i = 0, l = spriteList.length; i < l; i++) {
      var sprite = spriteList[i];
      try {
        ctx.drawImage(
          this._spriteSheet,
          (sprite.frame - 1) * 48 * scale,
          (sprite.type - 1) * 48 * scale,
          sprite.width * scale,
          sprite.width * scale,
          (sprite.x + sprite.xOffset - this._originX * 16) * scale,
          (sprite.y + sprite.yOffset - this._originY * 16) * scale,
          sprite.width * scale,
          sprite.width * scale
        );
      } catch (e2) {
        throw new Error("Failed to draw sprite " + sprite.type + " frame " + sprite.frame + " at " + sprite.x + ", " + sprite.y);
      }
      spriteDamage.push({
        x: Math.floor((sprite.x + sprite.xOffset - this._originX * 16) / tileWidth),
        xBound: Math.ceil((sprite.x + sprite.xOffset + sprite.width - this._originX * 16) / tileWidth),
        y: Math.floor((sprite.y + sprite.yOffset - this._originY * 16) / tileWidth),
        yBound: Math.ceil((sprite.y + sprite.yOffset + sprite.height - this._originY * 16) / tileWidth)
      });
    }
    return spriteDamage;
  };
  GameCanvas.prototype._processMouse = /* @__PURE__ */ (function() {
    var damage = { x: 0, xBound: 0, y: 0, yBound: 0 };
    return function(mouse) {
      if (mouse.width === 0 || mouse.height === 0)
        return;
      var mouseX = mouse.x;
      var mouseY = mouse.y;
      var mouseWidth = mouse.width;
      var mouseHeight = mouse.height;
      var options = { colour: mouse.colour, outline: true };
      if (mouseWidth > 2)
        mouseX -= 1;
      if (mouseHeight > 2)
        mouseY -= 1;
      var offMap = this._originX + mouseX < 0 && this._originX + mouseX + mouseWidth <= 0 || this._originY + mouseY < 0 && this._originY + mouseY + mouseHeight <= 0 || this._originX + mouseX >= this._map.width || this._originY + mouseY >= this._map.height;
      if (offMap) {
        damage.x = damage.xBound = mouseX;
        damage.y = damage.yBound = mouseY;
        return damage;
      }
      var pos2 = { x: mouseX * this._tileSet.tileWidth, y: mouseY * this._tileSet.tileWidth };
      var width2 = mouseWidth * this._tileSet.tileWidth;
      var height2 = mouseHeight * this._tileSet.tileWidth;
      MouseBox.draw(this._canvas, pos2, width2, height2, options);
      damage.x = mouseX - 1;
      damage.xBound = mouseX + mouseWidth + 2;
      damage.y = mouseY - 1;
      damage.yBound = mouseY + mouseWidth + 2;
      return damage;
    };
  })();
  GameCanvas.prototype._paintVoid = function(ctx, x, y) {
    var w = this._tileSet.tileWidth;
    ctx.fillStyle = "black";
    ctx.fillRect(x * w, y * w, w, w);
  };
  GameCanvas.prototype._paintOne = function(ctx, tileVal, x, y) {
    if (tileVal === TILE_INVALID2) {
      this._paintVoid(ctx, x, y);
      return;
    }
    var src = this._tileSet[tileVal];
    try {
      ctx.drawImage(src, x * this._tileSet.tileWidth, y * this._tileSet.tileWidth);
    } catch (e2) {
      var mapX = this._originX + x;
      var mapY = this._originY + y;
      throw new Error("Failed to draw tile " + tileVal + " at " + x + ", " + y + " (map " + mapX + ", " + mapY + " tile " + (this._map.testBounds(mapX, mapY) ? this._map.getTileValue(mapX, mapY) : "?? (Out of bounds)") + ")");
    }
  };
  GameCanvas.prototype._paintTiles = function(ctx, paintData) {
    var x, y, row, index;
    var lastPaintedTiles = this._lastPaintedTiles;
    var width2 = this._totalTilesInViewX;
    var height2 = this._totalTilesInViewY;
    if (lastPaintedTiles !== null) {
      var xBound = Math.min(this._lastPaintedWidth, width2);
      var yBound = Math.min(this._lastPaintedHeight, height2);
      for (y = 0; y < yBound; y++) {
        for (x = 0; x < xBound; x++) {
          index = y * width2 + x;
          if (lastPaintedTiles[index] === paintData[index])
            continue;
          this._paintOne(ctx, paintData[index], x, y);
        }
      }
      if (width2 > this._lastPaintedWidth) {
        for (y = 0; y < height2; y++) {
          for (x = this._lastPaintedWidth; x < width2; x++) {
            index = y * width2 + x;
            this._paintOne(ctx, paintData[index], x, y);
          }
        }
      }
      if (height2 > this._lastPaintedHeight) {
        for (y = this._lastPaintedHeight; y < height2; y++) {
          for (x = 0; x < width2; x++) {
            index = y * width2 + x;
            this._paintOne(ctx, paintData[index], x, y);
          }
        }
      }
    } else {
      for (y = 0; y < height2; y++) {
        for (x = 0; x < width2; x++) {
          index = y * width2 + x;
          this._paintOne(ctx, paintData[index], x, y);
        }
      }
    }
    this._lastPaintedWidth = width2;
    this._lastPaintedHeight = height2;
    var temp = this._lastPaintedTiles;
    this._lastPaintedTiles = paintData;
    this._currentPaintedTiles = temp;
  };
  GameCanvas.prototype.paint = function(mouse, sprites, isPaused) {
    var i, l, x, y, row, damaged, xBound, yBound, index;
    if (!this.ready)
      throw new Error("Not ready!");
    var ctx = this._canvas.getContext("2d");
    var lastPaintedTiles = this._lastPaintedTiles;
    if (this._pendingDimensionChange || this._pendingTileSet) {
      this._calculateDimensions();
      this._pendingDimensionChange = false;
      if (this._pendingTileSet !== null)
        this._tileSet = this._pendingTileSet;
      if (this._pendingTileSet || this.canvasWidth !== this._lastCanvasWidth || this.canvasHeight !== this._lastCanvasHeight) {
        ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        for (y = 0, l = lastPaintedTiles !== null ? lastPaintedTiles.length : 0; y < l; y++)
          lastPaintedTiles[y] = -2;
      }
      this._pendingTileSet = null;
    }
    var paintWidth = this._totalTilesInViewX;
    var paintHeight = this._totalTilesInViewY;
    var tileValues = this._map.getTileValuesForPainting(this._originX, this._originY, paintWidth, paintHeight, this._currentPaintedTiles);
    this.animationManager.getTiles(tileValues, this._originX, this._originY, paintWidth, paintHeight, isPaused);
    this._paintTiles(ctx, tileValues);
    lastPaintedTiles = this._lastPaintedTiles;
    this._lastCanvasWidth = this.canvasWidth;
    this._lastCanvasHeight = this.canvasHeight;
    if (!mouse && !sprites) {
      return;
    }
    if (mouse) {
      damaged = this._processMouse(mouse);
      for (y = Math.max(0, damaged.y), yBound = Math.min(paintHeight, damaged.yBound); y < yBound; y++) {
        for (x = Math.max(0, damaged.x), xBound = Math.min(paintWidth, damaged.xBound); x < xBound; x++) {
          index = [y * paintWidth + x];
          lastPaintedTiles[index] = -2;
        }
      }
    }
    if (sprites) {
      damaged = this._processSprites(ctx, sprites);
      for (i = 0, l = damaged.length; i < l; i++) {
        var damagedArea = damaged[i];
        for (y = Math.max(0, damagedArea.y), yBound = Math.min(damagedArea.yBound, paintHeight); y < yBound; y++) {
          for (x = Math.max(0, damagedArea.x), xBound = Math.min(damagedArea.xBound, paintWidth); x < xBound; x++) {
            index = [y * paintWidth + x];
            this._lastPaintedTiles[index] = -2;
          }
        }
      }
    }
  };
  GameCanvas.DEFAULT_ID = "MicropolisCanvas";

  // external/micropolisjs/src/mapGenerator.js
  var TERRAIN_CREATE_ISLAND;
  var TERRAIN_TREE_LEVEL = -1;
  var TERRAIN_LAKE_LEVEL = -1;
  var TERRAIN_CURVE_LEVEL = -1;
  var ISLAND_RADIUS = 18;
  var MapGenerator = function(w, h) {
    w = w || 120;
    h = h || 100;
    TERRAIN_CREATE_ISLAND = Random.getRandom(2) - 1;
    var map = new GameMap(w, h);
    if (TERRAIN_CREATE_ISLAND < 0) {
      if (Random.getRandom(100) < 10) {
        makeIsland(map);
        return map;
      }
    }
    if (TERRAIN_CREATE_ISLAND === 1)
      makeNakedIsland(map);
    else
      clearMap(map);
    if (TERRAIN_CURVE_LEVEL !== 0) {
      var terrainXStart = 40 + Random.getRandom(map.width - 80);
      var terrainYStart = 33 + Random.getRandom(map.height - 67);
      var terrainPos = new Position(terrainXStart, terrainYStart);
      doRivers(map, terrainPos);
    }
    if (TERRAIN_LAKE_LEVEL !== 0)
      makeLakes(map);
    smoothRiver(map);
    if (TERRAIN_TREE_LEVEL !== 0)
      doTrees(map);
    return map;
  };
  var clearMap = function(map) {
    for (var x = 0; x < map.width; x++) {
      for (var y = 0; y < map.height; y++) {
        map.setTile(x, y, DIRT, 0);
      }
    }
  };
  var makeNakedIsland = function(map) {
    var terrainIslandRadius = ISLAND_RADIUS;
    var x, y;
    for (x = 0; x < map.width; x++) {
      for (y = 0; y < map.height; y++) {
        if (x < 5 || x >= map.width - 5 || y < 5 || y >= map.height - 5) {
          map.setTile(x, y, RIVER, 0);
        } else {
          map.setTile(x, y, DIRT, 0);
        }
      }
    }
    for (x = 0; x < map.width - 5; x += 2) {
      var mapY = Random.getERandom(terrainIslandRadius);
      plopBRiver(map, new Position(x, mapY));
      mapY = map.height - 10 - Random.getERandom(terrainIslandRadius);
      plopBRiver(map, new Position(x, mapY));
      plopSRiver(map, new Position(x, 0));
      plopSRiver(map, new Position(x, map.height - 6));
    }
    for (y = 0; y < map.height - 5; y += 2) {
      var mapX = Random.getERandom(terrainIslandRadius);
      plopBRiver(map, new Position(mapX, y));
      mapX = map.width - 10 - Random.getERandom(terrainIslandRadius);
      plopBRiver(map, new Position(mapX, y));
      plopSRiver(map, new Position(0, y));
      plopSRiver(map, new Position(map.width - 6, y));
    }
  };
  var makeIsland = function(map) {
    makeNakedIsland(map);
    smoothRiver(map);
    doTrees(map);
  };
  var makeLakes = function(map) {
    var numLakes;
    if (TERRAIN_LAKE_LEVEL < 0)
      numLakes = Random.getRandom(10);
    else
      numLakes = TERRAIN_LAKE_LEVEL / 2;
    while (numLakes > 0) {
      var x = Random.getRandom(map.width - 21) + 10;
      var y = Random.getRandom(map.height - 20) + 10;
      makeSingleLake(map, new Position(x, y));
      numLakes--;
    }
  };
  var makeSingleLake = function(map, pos2) {
    var numPlops = Random.getRandom(12) + 2;
    while (numPlops > 0) {
      var plopPos = new Position(pos2, Random.getRandom(12) - 6, Random.getRandom(12) - 6);
      if (Random.getRandom(4))
        plopSRiver(map, plopPos);
      else
        plopBRiver(map, plopPos);
      numPlops--;
    }
  };
  var treeSplash = function(map, x, y) {
    var numTrees;
    if (TERRAIN_TREE_LEVEL < 0)
      numTrees = Random.getRandom(150) + 50;
    else
      numTrees = Random.getRandom(100 + TERRAIN_TREE_LEVEL * 2) + 50;
    var treePos = new Position(x, y);
    while (numTrees > 0) {
      var dir = getRandomDirection();
      treePos = Position.move(treePos, dir);
      if (!map.isPositionInBounds(treePos))
        return;
      if (map.getTileValue(treePos) === DIRT)
        map.setTile(treePos, WOODS, BLBNBIT);
      numTrees--;
    }
  };
  var doTrees = function(map) {
    var amount;
    if (TERRAIN_TREE_LEVEL < 0)
      amount = Random.getRandom(100) + 50;
    else
      amount = TERRAIN_TREE_LEVEL + 3;
    for (var x = 0; x < amount; x++) {
      var xloc = Random.getRandom(map.width - 1);
      var yloc = Random.getRandom(map.height - 1);
      treeSplash(map, xloc, yloc);
    }
    smoothTrees(map);
    smoothTrees(map);
  };
  var riverEdges = [
    13 | BULLBIT,
    13 | BULLBIT,
    17 | BULLBIT,
    15 | BULLBIT,
    5 | BULLBIT,
    RIVER,
    19 | BULLBIT,
    17 | BULLBIT,
    9 | BULLBIT,
    11 | BULLBIT,
    RIVER,
    13 | BULLBIT,
    7 | BULLBIT,
    9 | BULLBIT,
    5 | BULLBIT,
    RIVER
  ];
  var smoothRiver = function(map) {
    var dx = [-1, 0, 1, 0];
    var dy = [0, 1, 0, -1];
    for (var x = 0; x < map.width; x++) {
      for (var y = 0; y < map.height; y++) {
        if (map.getTileValue(x, y) === REDGE) {
          var bitIndex = 0;
          for (var z = 0; z < 4; z++) {
            bitIndex = bitIndex << 1;
            var xTemp = x + dx[z];
            var yTemp = y + dy[z];
            if (map.testBounds(xTemp, yTemp) && map.getTileValue(xTemp, yTemp) !== DIRT && (map.getTileValue(xTemp, yTemp) < WOODS_LOW || map.getTileValue(xTemp, yTemp) > WOODS_HIGH)) {
              bitIndex++;
            }
          }
          var temp = riverEdges[bitIndex & 15];
          if (temp !== RIVER && Random.getRandom(1))
            temp++;
          map.setTileValue(x, y, temp, 0);
        }
      }
    }
  };
  var isTree = function(tileValue) {
    return tileValue >= WOODS_LOW && tileValue <= WOODS_HIGH;
  };
  var smoothTrees = function(map) {
    for (var x = 0; x < map.width; x++) {
      for (var y = 0; y < map.height; y++) {
        if (isTree(map.getTileValue(x, y)))
          smoothTreesAt(map, x, y, false);
      }
    }
  };
  var treeTable = [
    0,
    0,
    0,
    34,
    0,
    0,
    36,
    35,
    0,
    32,
    0,
    33,
    30,
    31,
    29,
    37
  ];
  var smoothTreesAt = function(map, x, y, preserve) {
    var dx = [-1, 0, 1, 0];
    var dy = [0, 1, 0, -1];
    if (!isTree(map.getTileValue(x, y)))
      return;
    var bitIndex = 0;
    for (var i = 0; i < 4; i++) {
      bitIndex = bitIndex << 1;
      var xTemp = x + dx[i];
      var yTemp = y + dy[i];
      if (map.testBounds(xTemp, yTemp) && isTree(map.getTileValue(xTemp, yTemp)))
        bitIndex++;
    }
    var temp = treeTable[bitIndex & 15];
    if (temp) {
      if (temp !== WOODS) {
        if (x + y & 1)
          temp = temp - 8;
      }
      map.setTile(x, y, temp, BLBNBIT);
    } else {
      if (!preserve)
        map.setTileValue(x, y, temp, 0);
    }
  };
  var doRivers = function(map, terrainPos) {
    var riverDir = getRandomCardinalDirection();
    doBRiver(map, terrainPos, riverDir, riverDir);
    riverDir = riverDir.oppositeDirection();
    var terrainDir = doBRiver(map, terrainPos, riverDir, riverDir);
    riverDir = getRandomCardinalDirection();
    doSRiver(map, terrainPos, riverDir, terrainDir);
  };
  var doBRiver = function(map, pos2, riverDir, terrainDir) {
    var rate1, rate2;
    if (TERRAIN_CURVE_LEVEL < 0) {
      rate1 = 100;
      rate2 = 200;
    } else {
      rate1 = TERRAIN_CURVE_LEVEL + 10;
      rate2 = TERRAIN_CURVE_LEVEL + 100;
    }
    while (map.testBounds(pos2.x + 4, pos2.y + 4)) {
      plopBRiver(map, pos2);
      if (Random.getRandom(rate1) < 10) {
        terrainDir = riverDir;
      } else {
        if (Random.getRandom(rate2) > 90)
          terrainDir = terrainDir.rotateClockwise();
        if (Random.getRandom(rate2) > 90)
          terrainDir = terrainDir.rotateCounterClockwise();
      }
      pos2 = Position.move(pos2, terrainDir);
    }
    return terrainDir;
  };
  var doSRiver = function(map, pos2, riverDir, terrainDir) {
    var rate1, rate2;
    if (TERRAIN_CURVE_LEVEL < 0) {
      rate1 = 100;
      rate2 = 200;
    } else {
      rate1 = TERRAIN_CURVE_LEVEL + 10;
      rate2 = TERRAIN_CURVE_LEVEL + 100;
    }
    while (map.testBounds(pos2.x + 3, pos2.y + 3)) {
      plopSRiver(map, pos2);
      if (Random.getRandom(rate1) < 10) {
        terrainDir = riverDir;
      } else {
        if (Random.getRandom(rate2) > 90)
          terrainDir = terrainDir.rotateClockwise();
        if (Random.getRandom(rate2) > 90)
          terrainDir = terrainDir.rotateCounterClockwise();
      }
      pos2 = Position.move(pos2, terrainDir);
    }
    return terrainDir;
  };
  var putOnMap = function(map, newVal, x, y) {
    if (newVal === 0)
      return;
    if (!map.testBounds(x, y))
      return;
    var tileValue = map.getTileValue(x, y);
    if (tileValue !== DIRT) {
      if (tileValue === RIVER) {
        if (newVal !== CHANNEL)
          return;
      }
      if (tileValue === CHANNEL)
        return;
    }
    map.setTile(x, y, newVal, 0);
  };
  var plopBRiver = function(map, pos2) {
    var BRMatrix = [
      [0, 0, 0, REDGE, REDGE, REDGE, 0, 0, 0],
      [0, 0, REDGE, RIVER, RIVER, RIVER, REDGE, 0, 0],
      [0, REDGE, RIVER, RIVER, RIVER, RIVER, RIVER, REDGE, 0],
      [REDGE, RIVER, RIVER, RIVER, RIVER, RIVER, RIVER, RIVER, REDGE],
      [REDGE, RIVER, RIVER, RIVER, CHANNEL, RIVER, RIVER, RIVER, REDGE],
      [REDGE, RIVER, RIVER, RIVER, RIVER, RIVER, RIVER, RIVER, REDGE],
      [0, REDGE, RIVER, RIVER, RIVER, RIVER, RIVER, REDGE, 0],
      [0, 0, REDGE, RIVER, RIVER, RIVER, REDGE, 0, 0],
      [0, 0, 0, REDGE, REDGE, REDGE, 0, 0, 0]
    ];
    for (var x = 0; x < 9; x++) {
      for (var y = 0; y < 9; y++) {
        putOnMap(map, BRMatrix[y][x], pos2.x + x, pos2.y + y);
      }
    }
  };
  var plopSRiver = function(map, pos2) {
    var SRMatrix = [
      [0, 0, REDGE, REDGE, 0, 0],
      [0, REDGE, RIVER, RIVER, REDGE, 0],
      [REDGE, RIVER, RIVER, RIVER, RIVER, REDGE],
      [REDGE, RIVER, RIVER, RIVER, RIVER, REDGE],
      [0, REDGE, RIVER, RIVER, REDGE, 0],
      [0, 0, REDGE, REDGE, 0, 0]
    ];
    for (var x = 0; x < 6; x++) {
      for (var y = 0; y < 6; y++) {
        putOnMap(map, SRMatrix[y][x], pos2.x + x, pos2.y + y);
      }
    }
  };

  // external/micropolisjs/src/parkTool.js
  var makeTool3 = BaseTool.makeTool;
  var ParkTool = makeTool3(function(map) {
    this.init(10, map, true);
  });
  ParkTool.prototype.doTool = function(x, y, blockMaps) {
    if (this._worldEffects.getTileValue(x, y) !== DIRT) {
      this.result = this.TOOLRESULT_NEEDS_BULLDOZE;
      return;
    }
    var value = Random.getRandom(4);
    var tileFlags = BURNBIT | BULLBIT;
    var tileValue;
    if (value === 4) {
      tileValue = FOUNTAIN;
      tileFlags |= ANIMBIT;
    } else {
      tileValue = value + WOODS2;
    }
    this._worldEffects.setTile(x, y, tileValue, tileFlags);
    this.addCost(10);
    this.result = this.TOOLRESULT_OK;
  };

  // external/micropolisjs/src/railTool.js
  var RailTool = ConnectingTool(function(map) {
    this.init(20, map, true, true);
  });
  RailTool.prototype.layRail = function(x, y) {
    this.doAutoBulldoze(x, y);
    var tile3 = this._worldEffects.getTileValue(x, y);
    tile3 = TileUtils.normalizeRoad(tile3);
    var cost = this.toolCost;
    switch (tile3) {
      case DIRT:
        this._worldEffects.setTile(x, y, LHRAIL, BULLBIT | BURNBIT);
        break;
      case RIVER:
      case REDGE:
      case CHANNEL:
        cost = 100;
        if (x < this._map.width - 1) {
          tile3 = this._worldEffects.getTileValue(x + 1, y);
          tile3 = TileUtils.normalizeRoad(tile3);
          if (tile3 == RAILHPOWERV || tile3 == HRAIL || tile3 >= LHRAIL && tile3 <= HRAILROAD) {
            this._worldEffects.setTile(x, y, HRAIL, BULLBIT);
            break;
          }
        }
        if (x > 0) {
          tile3 = this._worldEffects.getTileValue(x - 1, y);
          tile3 = TileUtils.normalizeRoad(tile3);
          if (tile3 == RAILHPOWERV || tile3 == HRAIL || tile3 > VRAIL && tile3 < VRAILROAD) {
            this._worldEffects.setTile(x, y, HRAIL, BULLBIT);
            break;
          }
        }
        if (y < this._map.height - 1) {
          tile3 = this._worldEffects.getTileValue(x, y + 1);
          tile3 = TileUtils.normalizeRoad(tile3);
          if (tile3 == RAILVPOWERH || tile3 == VRAILROAD || tile3 > HRAIL && tile3 < HRAILROAD) {
            this._worldEffects.setTile(x, y, VRAIL, BULLBIT);
            break;
          }
        }
        if (y > 0) {
          tile3 = this._worldEffects.getTileValue(x, y - 1);
          tile3 = TileUtils.normalizeRoad(tile3);
          if (tile3 == RAILVPOWERH || tile3 == VRAILROAD || tile3 > HRAIL && tile3 < HRAILROAD) {
            this._worldEffects.setTile(x, y, VRAIL, BULLBIT);
            break;
          }
        }
        return this.TOOLRESULT_FAILED;
      case LHPOWER:
        this._worldEffects.setTile(x, y, RAILVPOWERH, CONDBIT | BURNBIT | BULLBIT);
        break;
      case LVPOWER:
        this._worldEffects.setTile(x, y, RAILHPOWERV, CONDBIT | BURNBIT | BULLBIT);
        break;
      case ROADS:
        this._worldEffects.setTile(x, y, VRAILROAD, BURNBIT | BULLBIT);
        break;
      case ROADS2:
        this._worldEffects.setTile(x, y, HRAILROAD, BURNBIT | BULLBIT);
        break;
      default:
        return this.TOOLRESULT_FAILED;
    }
    this.addCost(cost);
    this.checkZoneConnections(x, y);
    return this.TOOLRESULT_OK;
  };
  RailTool.prototype.doTool = function(x, y, blockMaps) {
    this.result = this.layRail(x, y);
  };

  // external/micropolisjs/src/roadTool.js
  var RoadTool = ConnectingTool(function(map) {
    this.init(10, map, true, true);
  });
  RoadTool.prototype.layRoad = function(x, y) {
    this.doAutoBulldoze(x, y);
    var tile3 = this._worldEffects.getTileValue(x, y);
    var cost = this.toolCost;
    switch (tile3) {
      case DIRT:
        this._worldEffects.setTile(x, y, ROADS, BULLBIT | BURNBIT);
        break;
      case RIVER:
      case REDGE:
      case CHANNEL:
        cost = 50;
        if (x < this._map.width - 1) {
          tile3 = this._worldEffects.getTileValue(x + 1, y);
          tile3 = TileUtils.normalizeRoad(tile3);
          if (tile3 === VRAILROAD || tile3 === HBRIDGE || tile3 >= ROADS && tile3 <= HROADPOWER) {
            this._worldEffects.setTile(x, y, HBRIDGE, BULLBIT);
            break;
          }
        }
        if (x > 0) {
          tile3 = this._worldEffects.getTileValue(x - 1, y);
          tile3 = TileUtils.normalizeRoad(tile3);
          if (tile3 === VRAILROAD || tile3 === HBRIDGE || tile3 >= ROADS && tile3 <= INTERSECTION) {
            this._worldEffects.setTile(x, y, HBRIDGE, BULLBIT);
            break;
          }
        }
        if (y < this._map.height - 1) {
          tile3 = this._worldEffects.getTileValue(x, y + 1);
          tile3 = TileUtils.normalizeRoad(tile3);
          if (tile3 === HRAILROAD || tile3 === VROADPOWER || tile3 >= VBRIDGE && tile3 <= INTERSECTION) {
            this._worldEffects.setTile(x, y, VBRIDGE, BULLBIT);
            break;
          }
        }
        if (y > 0) {
          tile3 = this._worldEffects.getTileValue(x, y - 1);
          tile3 = TileUtils.normalizeRoad(tile3);
          if (tile3 === HRAILROAD || tile3 === VROADPOWER || tile3 >= VBRIDGE && tile3 <= INTERSECTION) {
            this._worldEffects.setTile(x, y, VBRIDGE, BULLBIT);
            break;
          }
        }
        return this.TOOLRESULT_FAILED;
      case LHPOWER:
        this._worldEffects.setTile(x, y, VROADPOWER, CONDBIT | BURNBIT | BULLBIT);
        break;
      case LVPOWER:
        this._worldEffects.setTile(x, y, HROADPOWER, CONDBIT | BURNBIT | BULLBIT);
        break;
      case LHRAIL:
        this._worldEffects.setTile(x, y, HRAILROAD, BURNBIT | BULLBIT);
        break;
      case LVRAIL:
        this._worldEffects.setTile(x, y, VRAILROAD, BURNBIT | BULLBIT);
        break;
      default:
        return this.TOOLRESULT_FAILED;
    }
    this.addCost(cost);
    this.checkZoneConnections(x, y);
    return this.TOOLRESULT_OK;
  };
  RoadTool.prototype.doTool = function(x, y, blockMaps) {
    this.result = this.layRoad(x, y);
  };

  // external/micropolisjs/src/blockMap.ts
  var ID = (n) => n;
  var BlockMap = class {
    // Construct a block map. Takes three integers: the game map's width and height, and the block size (i.e. how many
    // tiles in each direction should map to the same block). The BlockMap entries will be initialised to zero.
    constructor(gameMapWidth, gameMapHeight, blockSize) {
      this.gameMapWidth = gameMapWidth;
      this.gameMapHeight = gameMapHeight;
      this.blockSize = blockSize;
      this.data = [];
      this._width = this.convertToBlockCount(this.gameMapWidth);
      this._height = this.convertToBlockCount(this.gameMapHeight);
      this.clear();
    }
    get width() {
      return this._width;
    }
    get height() {
      return this._height;
    }
    get(blockX, blockY) {
      const index = this.toIndex(blockX, blockY);
      return this.data[index];
    }
    set(blockX, blockY, value) {
      const index = this.toIndex(blockX, blockY);
      this.data[index] = value;
    }
    worldGet(worldX, worldY) {
      const { x, y } = this.toBlockCoordinate(worldX, worldY);
      return this.get(x, y);
    }
    worldSet(worldX, worldY, value) {
      const { x, y } = this.toBlockCoordinate(worldX, worldY);
      this.set(x, y, value);
    }
    clear() {
      this.forEach((x, y) => this.set(x, y, 0));
    }
    copyFrom(source, transform = ID) {
      if (this.hasIncompatibleDimensions(source)) {
        console.warn("Copying from incompatible blockMap!");
      }
      this.forEach((x, y) => this.set(x, y, transform(source.get(x, y))));
    }
    forEach(fn) {
      const maxWidth = this.width;
      const maxHeight = this.height;
      for (let x = 0; x < maxWidth; x++) {
        for (let y = 0; y < maxHeight; y++) {
          fn(x, y);
        }
      }
    }
    convertToBlockCount(value) {
      return Math.floor((value + this.blockSize - 1) / this.blockSize);
    }
    hasIncompatibleDimensions(map) {
      return map.gameMapHeight !== this.gameMapHeight || map.gameMapWidth !== this.gameMapWidth || map.blockSize !== this.blockSize;
    }
    toBlockCoordinate(worldX, worldY) {
      const x = this.toBlockIndex(worldX);
      const y = this.toBlockIndex(worldY);
      return { x, y };
    }
    toBlockIndex(worldIndex) {
      return Math.floor(worldIndex / this.blockSize);
    }
    toIndex(blockX, blockY) {
      return this.width * blockY + blockX;
    }
  };

  // external/micropolisjs/src/spriteConstants.ts
  var SPRITE_TRAIN = 1;
  var SPRITE_HELICOPTER = 2;
  var SPRITE_AIRPLANE = 3;
  var SPRITE_SHIP = 4;
  var SPRITE_MONSTER = 5;
  var SPRITE_TORNADO = 6;
  var SPRITE_EXPLOSION = 7;

  // external/micropolisjs/src/spriteUtils.js
  var pixToWorld = function(p) {
    return p >> 4;
  };
  var worldToPix = function(w) {
    return w << 4;
  };
  var turnTo = function(presentDir, desiredDir) {
    if (presentDir === desiredDir)
      return presentDir;
    if (presentDir < desiredDir) {
      if (desiredDir - presentDir < 4)
        presentDir++;
      else
        presentDir--;
    } else {
      if (presentDir - desiredDir < 4)
        presentDir--;
      else
        presentDir++;
    }
    if (presentDir > 8)
      presentDir = 1;
    if (presentDir < 1)
      presentDir = 8;
    return presentDir;
  };
  var getTileValue = function(map, x, y) {
    var wX = pixToWorld(x);
    var wY = pixToWorld(y);
    if (wX < 0 || wX >= map.width || wY < 0 || wY >= map.height)
      return -1;
    return map.getTileValue(wX, wY);
  };
  var directionTable = [0, 3, 2, 1, 3, 4, 5, 7, 6, 5, 7, 8, 1];
  var getDir = function(orgX, orgY, destX, destY) {
    var deltaX = destX - orgX;
    var deltaY = destY - orgY;
    var i;
    if (deltaX < 0) {
      if (deltaY < 0) {
        i = 11;
      } else {
        i = 8;
      }
    } else {
      if (deltaY < 0) {
        i = 2;
      } else {
        i = 5;
      }
    }
    deltaX = Math.abs(deltaX);
    deltaY = Math.abs(deltaY);
    if (deltaX * 2 < deltaY)
      i++;
    else if (deltaY * 2 < deltaX)
      i--;
    if (i < 0 || i > 12)
      i = 0;
    return directionTable[i];
  };
  var absoluteDistance = function(orgX, orgY, destX, destY) {
    var deltaX = destX - orgX;
    var deltaY = destY - orgY;
    return Math.abs(deltaX) + Math.abs(deltaY);
  };
  var checkWet = function(tileValue) {
    if (tileValue === HPOWER || tileValue === VPOWER || tileValue === HRAIL || tileValue === VRAIL || tileValue === BRWH || tileValue === BRWV)
      return true;
    else
      return false;
  };
  var destroyMapTile = function(spriteManager, map, blockMaps, ox, oy) {
    var x = pixToWorld(ox);
    var y = pixToWorld(oy);
    if (!map.testBounds(x, y))
      return;
    var tile3 = map.getTile(x, y);
    var tileValue = tile3.getValue();
    if (tileValue < TREEBASE)
      return;
    if (!tile3.isCombustible()) {
      if (tileValue >= ROADBASE && tileValue <= LASTROAD)
        map.setTile(x, y, RIVER, 0);
      return;
    }
    if (tile3.isZone()) {
      ZoneUtils.fireZone(map, x, y, blockMaps);
      if (tileValue > RZB)
        spriteManager.makeExplosionAt(ox, oy);
    }
    if (checkWet(tileValue))
      map.setTile(x, y, RIVER, 0);
    else
      map.setTile(x, y, TINYEXP, BULLBIT | ANIMBIT);
  };
  var getDistance = function(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  };
  var checkSpriteCollision = function(s1, s2) {
    return s1.frame !== 0 && s2.frame !== 0 && getDistance(s1.x, s1.y, s2.x, s2.y) < 30;
  };
  var SpriteUtils = {
    absoluteDistance,
    checkSpriteCollision,
    destroyMapTile,
    getDir,
    getTileValue,
    turnTo,
    pixToWorld,
    worldToPix
  };

  // external/micropolisjs/src/traffic.js
  function Traffic(map, spriteManager) {
    this._map = map;
    this._stack = [];
    this._spriteManager = spriteManager;
  }
  Traffic.prototype.makeTraffic = function(x, y, blockMaps, destFn) {
    this._stack = [];
    var pos2 = new Position(x, y);
    if (this.findPerimeterRoad(pos2)) {
      if (this.tryDrive(pos2, destFn)) {
        this.addToTrafficDensityMap(blockMaps);
        return Traffic.ROUTE_FOUND;
      }
      return Traffic.NO_ROUTE_FOUND;
    } else {
      return Traffic.NO_ROAD_FOUND;
    }
  };
  Traffic.prototype.addToTrafficDensityMap = function(blockMaps) {
    var trafficDensityMap = blockMaps.trafficDensityMap;
    while (this._stack.length > 0) {
      var pos2 = this._stack.pop();
      if (!this._map.testBounds(pos2.x, pos2.y))
        continue;
      var tileValue = this._map.getTileValue(pos2.x, pos2.y);
      if (tileValue >= ROADBASE && tileValue < POWERBASE) {
        var traffic = trafficDensityMap.worldGet(pos2.x, pos2.y);
        traffic += 50;
        traffic = Math.min(traffic, 240);
        trafficDensityMap.worldSet(pos2.x, pos2.y, traffic);
        if (traffic >= 240 && Random.getRandom(5) === 0) {
          var sprite = this._spriteManager.getSprite(SPRITE_HELICOPTER);
          if (sprite !== null) {
            sprite.destX = SpriteUtils.worldToPix(pos2.x);
            sprite.destY = SpriteUtils.worldToPix(pos2.y);
          }
        }
      }
    }
  };
  var perimX = [-1, 0, 1, 2, 2, 2, 1, 0, -1, -2, -2, -2];
  var perimY = [-2, -2, -2, -1, 0, 1, 2, 2, 2, 1, 0, -1];
  Traffic.prototype.findPerimeterRoad = function(pos2) {
    for (var i = 0; i < 12; i++) {
      var xx = pos2.x + perimX[i];
      var yy = pos2.y + perimY[i];
      if (this._map.testBounds(xx, yy)) {
        if (TileUtils.isDriveable(this._map.getTileValue(xx, yy))) {
          pos2.x = xx;
          pos2.y = yy;
          return true;
        }
      }
    }
    return false;
  };
  var MAX_TRAFFIC_DISTANCE = 30;
  Traffic.prototype.tryDrive = function(startPos, destFn) {
    var dirLast;
    var drivePos = new Position(startPos);
    for (var dist = 0; dist < MAX_TRAFFIC_DISTANCE; dist++) {
      var dir = this.tryGo(drivePos, dirLast);
      if (dir) {
        drivePos = Position.move(pos, dir);
        dirLast = dir.oppositeDirection();
        if (dist & 1)
          this._stack.push(new Position(drivePos));
        if (this.driveDone(drivePos, destFn))
          return true;
      } else {
        if (this._stack.length > 0) {
          this._stack.pop();
          dist += 3;
        } else {
          return false;
        }
      }
    }
    return false;
  };
  Traffic.prototype.tryGo = function(pos2, dirLast) {
    var directions = [];
    var count = 0;
    forEachCardinalDirection((dir) => {
      if (dir != dirLast && TileUtils.isDriveable(this._map.getTileFromMapOrDefault(pos2, dir, DIRT))) {
        directions.push(dir);
        count++;
      }
    });
    if (count === 0) {
      return;
    }
    if (count === 1) {
      return directions[0];
    }
    const index = Random.getRandom(directions.length - 1);
    return directions[index];
  };
  Traffic.prototype.driveDone = function(pos2, destFn) {
    if (pos2.y > 0) {
      if (destFn(this._map.getTileValue(pos2.x, pos2.y - 1)))
        return true;
    }
    if (pos2.x < this._map.width - 1) {
      if (destFn(this._map.getTileValue(pos2.x + 1, pos2.y)))
        return true;
    }
    if (pos2.y < this._map.height - 1) {
      if (destFn(this._map.getTileValue(pos2.x, pos2.y + 1)))
        return true;
    }
    if (pos2.x > 0) {
      if (destFn(this._map.getTileValue(pos2.x - 1, pos2.y)))
        return true;
    }
    return false;
  };
  Object.defineProperties(
    Traffic,
    {
      ROUTE_FOUND: MiscUtils.makeConstantDescriptor(1),
      NO_ROUTE_FOUND: MiscUtils.makeConstantDescriptor(0),
      NO_ROAD_FOUND: MiscUtils.makeConstantDescriptor(-1)
    }
  );

  // external/micropolisjs/src/commercial.js
  var getZonePopulation = function(map, x, y, tileValue) {
    if (tileValue === COMCLR)
      return 0;
    return Math.floor((tileValue - CZB) / 9) % 5 + 1;
  };
  var placeCommercial = function(map, x, y, population, lpValue, zonePower) {
    var centreTile = (lpValue * 5 + population) * 9 + CZB;
    ZoneUtils.putZone(map, x, y, centreTile, zonePower);
  };
  var growZone = function(map, x, y, blockMaps, population, lpValue, zonePower) {
    var landValue = blockMaps.landValueMap.worldGet(x, y);
    landValue = landValue >> 5;
    if (population > landValue)
      return;
    if (population < 5) {
      placeCommercial(map, x, y, population, lpValue, zonePower);
      ZoneUtils.incRateOfGrowth(blockMaps, x, y, 8);
    }
  };
  var degradeZone = function(map, x, y, blockMaps, populationCategory, lpCategory, zonePower) {
    if (populationCategory > 1) {
      placeCommercial(map, x, y, populationCategory - 2, lpCategory, zonePower);
    } else {
      ZoneUtils.putZone(map, x, y, COMCLR, zonePower);
    }
    ZoneUtils.incRateOfGrowth(blockMaps, x, y, -8);
  };
  var commercialFound = function(map, x, y, simData) {
    var lpValue;
    simData.census.comZonePop += 1;
    var tileValue = map.getTileValue(x, y);
    var population = getZonePopulation(map, x, y, tileValue);
    simData.census.comPop += population;
    var zonePower = map.getTile(x, y).isPowered();
    var trafficOK = Traffic.ROUTE_FOUND;
    if (population > Random.getRandom(5)) {
      trafficOK = simData.trafficManager.makeTraffic(x, y, simData.blockMaps, TileUtils.isIndustrial);
      if (trafficOK === Traffic.NO_ROAD_FOUND) {
        lpValue = ZoneUtils.getLandPollutionValue(simData.blockMaps, x, y);
        degradeZone(map, x, y, simData.blockMaps, population, lpValue, zonePower);
        return;
      }
    }
    if (Random.getChance(7)) {
      var locationScore = trafficOK === Traffic.NO_ROAD_FOUND ? -3e3 : simData.blockMaps.cityCentreDistScoreMap.worldGet(x, y);
      var zoneScore = simData.valves.comValve + locationScore;
      if (!zonePower)
        zoneScore = -500;
      if (zonePower && zoneScore > -350 && zoneScore - 26380 > Random.getRandom16Signed()) {
        lpValue = ZoneUtils.getLandPollutionValue(simData.blockMaps, x, y);
        growZone(map, x, y, simData.blockMaps, population, lpValue, zonePower);
        return;
      }
      if (zoneScore < 350 && zoneScore + 26380 < Random.getRandom16Signed()) {
        lpValue = ZoneUtils.getLandPollutionValue(simData.blockMaps, x, y);
        degradeZone(map, x, y, simData.blockMaps, population, lpValue, zonePower);
      }
    }
  };
  var Commercial = {
    registerHandlers: function(mapScanner, repairManager) {
      mapScanner.addAction(TileUtils.isCommercialZone, commercialFound);
    },
    getZonePopulation
  };

  // external/micropolisjs/src/industrial.js
  var getZonePopulation2 = function(map, x, y, tileValue) {
    if (tileValue === INDCLR)
      return 0;
    return Math.floor((tileValue - IZB) / 9) % 4 + 1;
  };
  var placeIndustrial = function(map, x, y, populationCategory, valueCategory, zonePower) {
    var centreTile = (valueCategory * 4 + populationCategory) * 9 + IZB;
    ZoneUtils.putZone(map, x, y, centreTile, zonePower);
  };
  var growZone2 = function(map, x, y, blockMaps, population, valueCategory, zonePower) {
    if (population < 4) {
      placeIndustrial(map, x, y, population, valueCategory, zonePower);
      ZoneUtils.incRateOfGrowth(blockMaps, x, y, 8);
    }
  };
  var degradeZone2 = function(map, x, y, blockMaps, populationCategory, valueCategory, zonePower) {
    if (populationCategory > 1)
      placeIndustrial(map, x, y, populationCategory - 2, valueCategory, zonePower);
    else
      ZoneUtils.putZone(map, x, y, INDCLR, zonePower);
    ZoneUtils.incRateOfGrowth(blockMaps, x, y, -8);
  };
  var animated = [true, false, true, true, false, false, true, true];
  var xDelta = [-1, 0, 1, 0, 0, 0, 0, 1];
  var yDelta = [-1, 0, -1, -1, 0, 0, -1, -1];
  var setAnimation = function(map, x, y, tileValue, isPowered) {
    if (tileValue < IZB)
      return;
    var i = tileValue - IZB >> 3;
    if (animated[i] && isPowered) {
      map.addTileFlags(x + xDelta[i], y + yDelta[i], ASCBIT);
    } else {
      map.addTileFlags(x + xDelta[i], y + yDelta[i], BNCNBIT);
      map.removeTileFlags(x + xDelta[i], y + yDelta[i], ANIMBIT);
    }
  };
  var industrialFound = function(map, x, y, simData) {
    simData.census.indZonePop += 1;
    var tileValue = map.getTileValue(x, y);
    var population = getZonePopulation2(map, x, y, tileValue);
    simData.census.indPop += population;
    var zonePower = map.getTile(x, y).isPowered();
    setAnimation(map, x, y, tileValue, zonePower);
    var trafficOK = Traffic.ROUTE_FOUND;
    if (population > Random.getRandom(5)) {
      trafficOK = simData.trafficManager.makeTraffic(x, y, simData.blockMaps, TileUtils.isResidential);
      if (trafficOK === Traffic.NO_ROAD_FOUND) {
        var newValue = Random.getRandom16() & 1;
        degradeZone2(map, x, y, simData.blockMaps, population, newValue, zonePower);
        return;
      }
    }
    if (Random.getChance(7)) {
      var zoneScore = simData.valves.indValve + (trafficOK === Traffic.NO_ROAD_FOUND ? -1e3 : 0);
      if (!zonePower)
        zoneScore = -500;
      if (zoneScore > -350 && zoneScore - 26380 > Random.getRandom16Signed()) {
        growZone2(map, x, y, simData.blockMaps, population, Random.getRandom16() & 1, zonePower);
        return;
      }
      if (zoneScore < 350 && zoneScore + 26380 < Random.getRandom16Signed())
        degradeZone2(map, x, y, simData.blockMaps, population, Random.getRandom16() & 1, zonePower);
    }
  };
  var Industrial = {
    registerHandlers: function(mapScanner, repairManager) {
      mapScanner.addAction(TileUtils.isIndustrialZone, industrialFound);
    },
    getZonePopulation: getZonePopulation2
  };

  // external/micropolisjs/src/residential.js
  var placeResidential = function(map, x, y, population, lpValue, zonePower) {
    var centreTile = (lpValue * 4 + population) * 9 + RZB;
    ZoneUtils.putZone(map, x, y, centreTile, zonePower);
  };
  var getFreeZonePopulation = function(map, x, y, tileValue) {
    var count = 0;
    for (var xx = x - 1; xx <= x + 1; xx++) {
      for (var yy = y - 1; yy <= y + 1; yy++) {
        if (xx === x && yy === y) continue;
        tileValue = map.getTileValue(xx, yy);
        if (tileValue >= LHTHR && tileValue <= HHTHR)
          count += 1;
      }
    }
    return count;
  };
  var getZonePopulation3 = function(map, x, y, tileValue) {
    if (tileValue instanceof Tile)
      tileValue = tile.getValue();
    if (tileValue === FREEZ)
      return getFreeZonePopulation(map, x, y, tileValue);
    var populationIndex = Math.floor((tileValue - RZB) / 9) % 4 + 1;
    return populationIndex * 8 + 16;
  };
  var evalLot = function(map, x, y) {
    var xDelta9 = [0, 1, 0, -1];
    var yDelta9 = [-1, 0, 1, 0];
    if (!map.testBounds(x, y))
      return -1;
    var tileValue = map.getTileValue(x, y);
    if (tileValue < RESBASE || tileValue > RESBASE + 8)
      return -1;
    var score = 1;
    for (var i = 0; i < 4; i++) {
      var edgeX = x + xDelta9[i];
      var edgeY = y + yDelta9[i];
      if (edgeX < 0 || edgeX >= map.width || edgeY < 0 || edgeY >= map.height)
        continue;
      tileValue = map.getTileValue(edgeX, edgeY);
      if (tileValue !== DIRT && tileValue <= LASTROAD)
        score += 1;
    }
    return score;
  };
  var buildHouse = function(map, x, y, lpValue) {
    var best = 0;
    var bestScore = 0;
    var xDelta9 = [0, -1, 0, 1, -1, 1, -1, 0, 1];
    var yDelta9 = [0, -1, -1, -1, 0, 0, 1, 1, 1];
    for (var i = 0; i < 9; i++) {
      var xx = x + xDelta9[i];
      var yy = y + yDelta9[i];
      var score = evalLot(map, xx, yy);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      } else if (score === bestScore && Random.getChance(7)) {
        best = i;
      }
    }
    if (best > 0 && map.testBounds(x + xDelta9[best], y + yDelta9[best]))
      map.setTile(
        x + xDelta9[best],
        y + yDelta9[best],
        HOUSE + Random.getRandom(2) + lpValue * 3,
        BLBNCNBIT
      );
  };
  var growZone3 = function(map, x, y, blockMaps, population, lpValue, zonePower) {
    var pollution = blockMaps.pollutionDensityMap.worldGet(x, y);
    if (pollution > 128)
      return;
    var tileValue = map.getTileValue(x, y);
    if (tileValue === FREEZ) {
      if (population < 8) {
        buildHouse(map, x, y, lpValue);
        ZoneUtils.incRateOfGrowth(blockMaps, x, y, 1);
      } else if (blockMaps.populationDensityMap.worldGet(x, y) > 64) {
        placeResidential(map, x, y, 0, lpValue, zonePower);
        ZoneUtils.incRateOfGrowth(blockMaps, x, y, 8);
      }
      return;
    }
    if (population < 40) {
      placeResidential(map, x, y, Math.floor(population / 8) - 1, lpValue, zonePower);
      ZoneUtils.incRateOfGrowth(blockMaps, x, y, 8);
    }
  };
  var freeZone = [0, 3, 6, 1, 4, 7, 2, 5, 8];
  var degradeZone3 = function(map, x, y, blockMaps, population, lpValue, zonePower) {
    var xx, yy;
    if (population === 0)
      return;
    if (population > 16) {
      placeResidential(map, x, y, Math.floor((population - 24) / 8), lpValue, zonePower);
      ZoneUtils.incRateOfGrowth(blockMaps, x, y, -8);
      return;
    }
    if (population === 16) {
      map.setTile(x, y, FREEZ, BLBNCNBIT | ZONEBIT);
      for (yy = y - 1; yy <= y + 1; yy++) {
        for (xx = x - 1; xx <= x + 1; xx++) {
          if (xx === x && yy === y) continue;
          map.setTile(x, y, LHTHR + lpValue + Random.getRandom(2), BLBNCNBIT);
        }
      }
      ZoneUtils.incRateOfGrowth(blockMaps, x, y, -8);
      return;
    }
    var i = 0;
    ZoneUtils.incRateOfGrowth(blockMaps, x, y, -1);
    for (xx = x - 1; xx <= x + 1; xx++) {
      for (yy = y - 1; yy <= y + 1; yy++, i++) {
        var currentValue = map.getTileValue(xx, yy);
        if (currentValue >= LHTHR && currentValue <= HHTHR) {
          map.setTile(xx, yy, freeZone[i] + RESBASE, BLBNCNBIT);
          return;
        }
      }
    }
  };
  var evalResidential = function(blockMaps, x, y, traffic) {
    if (traffic === Traffic.NO_ROAD_FOUND)
      return -3e3;
    var landValue = blockMaps.landValueMap.worldGet(x, y);
    landValue -= blockMaps.pollutionDensityMap.worldGet(x, y);
    if (landValue < 0)
      landValue = 0;
    else
      landValue = Math.min(landValue * 32, 6e3);
    return landValue - 3e3;
  };
  var residentialFound = function(map, x, y, simData) {
    var lpValue;
    simData.census.resZonePop += 1;
    var tileValue = map.getTileValue(x, y);
    var population = getZonePopulation3(map, x, y, tileValue);
    simData.census.resPop += population;
    var zonePower = map.getTile(x, y).isPowered();
    var trafficOK = Traffic.ROUTE_FOUND;
    if (population > Random.getRandom(35)) {
      trafficOK = simData.trafficManager.makeTraffic(x, y, simData.blockMaps, TileUtils.isCommercial);
      if (trafficOK === Traffic.NO_ROAD_FOUND) {
        lpValue = ZoneUtils.getLandPollutionValue(simData.blockMaps, x, y);
        degradeZone3(map, x, y, simData.blockMaps, population, lpValue, zonePower);
        return;
      }
    }
    if (tileValue === FREEZ || Random.getChance(7)) {
      var locationScore = evalResidential(simData.blockMaps, x, y, trafficOK);
      var zoneScore = simData.valves.resValve + locationScore;
      if (!zonePower)
        zoneScore = -500;
      if (zoneScore > -350 && zoneScore - 26380 > Random.getRandom16Signed()) {
        if (population === 0 && Random.getChance(3)) {
          makeHospital(map, x, y, simData, zonePower);
          return;
        }
        lpValue = ZoneUtils.getLandPollutionValue(simData.blockMaps, x, y);
        growZone3(map, x, y, simData.blockMaps, population, lpValue, zonePower);
        return;
      }
      if (zoneScore < 350 && zoneScore + 26380 < Random.getRandom16Signed()) {
        lpValue = ZoneUtils.getLandPollutionValue(simData.blockMaps, x, y);
        degradeZone3(map, x, y, simData.blockMaps, population, lpValue, zonePower);
      }
    }
  };
  var makeHospital = function(map, x, y, simData, zonePower) {
    if (simData.census.needHospital > 0) {
      ZoneUtils.putZone(map, x, y, HOSPITAL, zonePower);
      simData.census.needHospital = 0;
      return;
    }
  };
  var hospitalFound = function(map, x, y, simData) {
    simData.census.hospitalPop += 1;
    if (simData.census.needHospital === -1) {
      if (Random.getRandom(20) === 0)
        ZoneUtils.putZone(map, x, y, FREEZ, map.getTile(x, y).isPowered());
    }
  };
  var Residential = {
    registerHandlers: function(mapScanner, repairManager) {
      mapScanner.addAction(TileUtils.isResidentialZone, residentialFound);
      mapScanner.addAction(HOSPITAL, hospitalFound);
      repairManager.addAction(HOSPITAL, 15, 3);
    },
    getZonePopulation: getZonePopulation3
  };

  // external/micropolisjs/src/blockMapUtils.js
  var SMOOTH_NEIGHBOURS_THEN_BLOCK = 0;
  var SMOOTH_ALL_THEN_CLAMP = 1;
  var smoothMap = function(src, dest, smoothStyle) {
    for (var x = 0, width2 = src.width; x < width2; x++) {
      for (var y = 0, height2 = src.height; y < height2; y++) {
        var edges = 0;
        if (x > 0)
          edges += src.get(x - 1, y);
        if (x < src.width - 1)
          edges += src.get(x + 1, y);
        if (y > 0)
          edges += src.get(x, y - 1);
        if (y < src.height - 1)
          edges += src.get(x, y + 1);
        if (smoothStyle === SMOOTH_NEIGHBOURS_THEN_BLOCK) {
          edges = src.get(x, y) + Math.floor(edges / 4);
          dest.set(x, y, Math.floor(edges / 2));
        } else {
          edges = edges + src.get(x, y) >> 2;
          if (edges > 255)
            edges = 255;
          dest.set(x, y, edges);
        }
      }
    }
  };
  var neutraliseRateOfGrowthMap = function(blockMaps) {
    var rateOfGrowthMap = blockMaps.rateOfGrowthMap;
    for (var x = 0, width2 = rateOfGrowthMap.width; x < width2; x++) {
      for (var y = 0, height2 = rateOfGrowthMap.height; y < height2; y++) {
        var rate = rateOfGrowthMap.get(x, y);
        if (rate === 0)
          continue;
        if (rate > 0)
          rate--;
        else
          rate++;
        rate = MiscUtils.clamp(rate, -200, 200);
        rateOfGrowthMap.set(x, y, rate);
      }
    }
  };
  var neutraliseTrafficMap = function(blockMaps) {
    var trafficDensityMap = blockMaps.trafficDensityMap;
    for (var x = 0, width2 = trafficDensityMap.width; x < width2; x++) {
      for (var y = 0, height2 = trafficDensityMap.height; y < height2; y++) {
        var trafficDensity = trafficDensityMap.get(x, y);
        if (trafficDensity === 0)
          continue;
        if (trafficDensity <= 24)
          trafficDensity = 0;
        else if (trafficDensity > 200)
          trafficDensity = trafficDensity - 34;
        else
          trafficDensity = trafficDensity - 24;
        trafficDensityMap.set(x, y, trafficDensity);
      }
    }
  };
  var getPollutionValue = function(tileValue) {
    if (tileValue < POWERBASE) {
      if (tileValue >= HTRFBASE)
        return 75;
      if (tileValue >= LTRFBASE)
        return 50;
      if (tileValue < ROADBASE) {
        if (tileValue > FIREBASE)
          return 90;
        if (tileValue >= RADTILE)
          return 255;
      }
      return 0;
    }
    if (tileValue <= LASTIND)
      return 0;
    if (tileValue < PORTBASE)
      return 50;
    if (tileValue <= LASTPOWERPLANT)
      return 100;
    return 0;
  };
  var getCityCentreDistance = function(map, x, y) {
    var xDis, yDis;
    if (x > map.cityCentreX)
      xDis = x - map.cityCentreX;
    else
      xDis = map.cityCentreX - x;
    if (y > map.cityCentreY)
      yDis = y - map.cityCentreY;
    else
      yDis = map.cityCentreY - y;
    return Math.min(xDis + yDis, 64);
  };
  var pollutionTerrainLandValueScan = function(map, census, blockMaps) {
    var tempMap1 = blockMaps.tempMap1;
    var tempMap2 = blockMaps.tempMap2;
    var tempMap3 = blockMaps.tempMap3;
    tempMap3.clear();
    var landValueMap = blockMaps.landValueMap;
    var terrainDensityMap = blockMaps.terrainDensityMap;
    var pollutionDensityMap = blockMaps.pollutionDensityMap;
    var crimeRateMap = blockMaps.crimeRateMap;
    var x, y, width2, height2;
    var totalLandValue = 0;
    var developedTileCount = 0;
    for (x = 0, width2 = landValueMap.width; x < width2; x++) {
      for (y = 0, height2 = landValueMap.height; y < height2; y++) {
        var pollutionLevel = 0;
        var developed = false;
        var worldX = x * 2;
        var worldY = y * 2;
        for (var mapX = worldX; mapX <= worldX + 1; mapX++) {
          for (var mapY = worldY; mapY <= worldY + 1; mapY++) {
            var tileValue = map.getTileValue(mapX, mapY);
            if (tileValue === DIRT)
              continue;
            if (tileValue < RUBBLE) {
              var terrainValue = tempMap3.worldGet(mapX, mapY);
              tempMap3.worldSet(mapX, mapY, terrainValue + 15);
              continue;
            }
            pollutionLevel += getPollutionValue(tileValue);
            if (tileValue >= ROADBASE)
              developed = true;
          }
        }
        pollutionLevel = Math.min(pollutionLevel, 255);
        tempMap1.set(x, y, pollutionLevel);
        if (developed) {
          var landValue = 34 - Math.floor(getCityCentreDistance(map, worldX, worldY) / 2);
          landValue = landValue << 2;
          landValue += terrainDensityMap.get(x >> 1, y >> 1);
          landValue -= pollutionDensityMap.get(x, y);
          if (crimeRateMap.get(x, y) > 190)
            landValue -= 20;
          landValue = MiscUtils.clamp(landValue, 1, 250);
          landValueMap.set(x, y, landValue);
          totalLandValue += landValue;
          developedTileCount++;
        } else {
          landValueMap.set(x, y, 0);
        }
      }
    }
    if (developedTileCount > 0)
      census.landValueAverage = Math.floor(totalLandValue / developedTileCount);
    else
      census.landValueAverage = 0;
    smoothMap(tempMap1, tempMap2, SMOOTH_ALL_THEN_CLAMP);
    smoothMap(tempMap2, tempMap1, SMOOTH_ALL_THEN_CLAMP);
    var maxPollution = 0;
    var pollutedTileCount = 0;
    var totalPollution = 0;
    for (x = 0, width2 = map.width; x < width2; x += pollutionDensityMap.blockSize) {
      for (y = 0, height2 = map.height; y < height2; y += pollutionDensityMap.blockSize) {
        var pollution = tempMap1.worldGet(x, y);
        pollutionDensityMap.worldSet(x, y, pollution);
        if (pollution !== 0) {
          pollutedTileCount++;
          totalPollution += pollution;
          if (pollution > maxPollution || pollution === maxPollution && Random.getChance(3)) {
            maxPollution = pollution;
            map.pollutionMaxX = x;
            map.pollutionMaxY = y;
          }
        }
      }
    }
    if (pollutedTileCount)
      census.pollutionAverage = Math.floor(totalPollution / pollutedTileCount);
    else
      census.pollutionAverage = 0;
    smoothMap(tempMap3, terrainDensityMap, SMOOTH_NEIGHBOURS_THEN_BLOCK);
  };
  var crimeScan = function(census, blockMaps) {
    var policeStationMap = blockMaps.policeStationMap;
    var policeStationEffectMap = blockMaps.policeStationEffectMap;
    var crimeRateMap = blockMaps.crimeRateMap;
    var landValueMap = blockMaps.landValueMap;
    var populationDensityMap = blockMaps.populationDensityMap;
    smoothMap(policeStationMap, policeStationEffectMap, SMOOTH_NEIGHBOURS_THEN_BLOCK);
    smoothMap(policeStationEffectMap, policeStationMap, SMOOTH_NEIGHBOURS_THEN_BLOCK);
    smoothMap(policeStationMap, policeStationEffectMap, SMOOTH_NEIGHBOURS_THEN_BLOCK);
    var totalCrime = 0;
    var crimeZoneCount = 0;
    for (var x = 0, width2 = crimeRateMap.mapWidth, blockSize = crimeRateMap.blockSize; x < width2; x += blockSize) {
      for (var y = 0, height2 = crimeRateMap.mapHeight, b; y < height2; y += blockSize) {
        var value = landValueMap.worldGet(x, y);
        if (value > 0) {
          crimeZoneCount += 1;
          value = 128 - value;
          value += populationDensityMap.worldGet(x, y);
          value = Math.min(value, 300);
          value -= policeStationMap.worldGet(x, y);
          value = MiscUtils.clamp(value, 0, 250);
          crimeRateMap.worldSet(x, y, value);
          totalCrime += value;
        } else {
          crimeRateMap.worldSet(x, y, 0);
        }
      }
    }
    if (crimeZoneCount > 0)
      census.crimeAverage = Math.floor(totalCrime / crimeZoneCount);
    else
      census.crimeAverage = 0;
  };
  var fillCityCentreDistScoreMap = function(map, blockMaps) {
    var cityCentreDistScoreMap = blockMaps.cityCentreDistScoreMap;
    for (var x = 0, width2 = cityCentreDistScoreMap.width; x < width2; x++) {
      for (var y = 0, height2 = cityCentreDistScoreMap.height; y < height2; y++) {
        var value = Math.floor(getCityCentreDistance(map, x * 8, y * 8) / 2);
        value = value * 4;
        value = 64 - value;
        cityCentreDistScoreMap.set(x, y, value);
      }
    }
  };
  var getPopulationDensity = function(map, x, y, tile3) {
    if (tile3 < COMBASE)
      return Residential.getZonePopulation(map, x, y, tile3);
    if (tile3 < INDBASE)
      return Commercial.getZonePopulation(map, x, y, tile3) * 8;
    if (tile3 < PORTBASE)
      return Industrial.getZonePopulation(map, x, y, tile3) * 8;
    return 0;
  };
  var populationDensityScan = function(map, blockMaps) {
    var tempMap1 = blockMaps.tempMap1;
    var tempMap2 = blockMaps.tempMap2;
    var populationDensityMap = blockMaps.populationDensityMap;
    var xTot = 0;
    var yTot = 0;
    var zoneTotal = 0;
    tempMap1.clear();
    for (var x = 0, width2 = map.width; x < width2; x++) {
      for (var y = 0, height2 = map.height; y < height2; y++) {
        var tile3 = map.getTile(x, y);
        if (tile3.isZone()) {
          var tileValue = tile3.getValue();
          var population = getPopulationDensity(map, x, y, tileValue) * 8;
          population = Math.min(population, 254);
          tempMap1.worldSet(x, y, population);
          xTot += x;
          yTot += y;
          zoneTotal++;
        }
      }
    }
    smoothMap(tempMap1, tempMap2, SMOOTH_ALL_THEN_CLAMP);
    smoothMap(tempMap2, tempMap1, SMOOTH_ALL_THEN_CLAMP);
    smoothMap(tempMap1, tempMap2, SMOOTH_ALL_THEN_CLAMP);
    blockMaps.populationDensityMap.copyFrom(tempMap2, function(x2) {
      return x2 * 2;
    });
    fillCityCentreDistScoreMap(map, blockMaps);
    if (zoneTotal > 0) {
      map.cityCentreX = Math.floor(xTot / zoneTotal);
      map.cityCentreY = Math.floor(yTot / zoneTotal);
    } else {
      map.cityCentreX = Math.floor(map.width / 2);
      map.cityCentreY = Math.floor(map.height / 2);
    }
  };
  var fireAnalysis = function(blockMaps) {
    var fireStationMap = blockMaps.fireStationMap;
    var fireStationEffectMap = blockMaps.fireStationEffectMap;
    smoothMap(fireStationMap, fireStationEffectMap, SMOOTH_NEIGHBOURS_THEN_BLOCK);
    smoothMap(fireStationEffectMap, fireStationMap, SMOOTH_NEIGHBOURS_THEN_BLOCK);
    smoothMap(fireStationMap, fireStationEffectMap, SMOOTH_NEIGHBOURS_THEN_BLOCK);
  };
  var BlockMapUtils = {
    crimeScan,
    fireAnalysis,
    neutraliseRateOfGrowthMap,
    neutraliseTrafficMap,
    pollutionTerrainLandValueScan,
    populationDensityScan
  };

  // external/micropolisjs/src/budget.js
  var policeMaintenanceCost = 100;
  var fireMaintenanceCost = 100;
  var roadMaintenanceCost = 1;
  var railMaintenanceCost = 2;
  var Budget = EventEmitter(function() {
    Object.defineProperties(
      this,
      {
        MAX_ROAD_EFFECT: MiscUtils.makeConstantDescriptor(32),
        MAX_POLICESTATION_EFFECT: MiscUtils.makeConstantDescriptor(1e3),
        MAX_FIRESTATION_EFFECT: MiscUtils.makeConstantDescriptor(1e3)
      }
    );
    this.roadEffect = this.MAX_ROAD_EFFECT;
    this.policeEffect = this.MAX_POLICESTATION_EFFECT;
    this.fireEffect = this.MAX_FIRESTATION_EFFECT;
    this.totalFunds = 0;
    this.cityTax = 7;
    this.cashFlow = 0;
    this.taxFund = 0;
    this.roadMaintenanceBudget = 0;
    this.fireMaintenanceBudget = 0;
    this.policeMaintenanceBudget = 0;
    this.roadPercent = 1;
    this.firePercent = 1;
    this.policePercent = 1;
    this.roadSpend = 0;
    this.fireSpend = 0;
    this.policeSpend = 0;
    this.awaitingValues = false;
    this.autoBudget = true;
  });
  var saveProps2 = [
    "autoBudget",
    "totalFunds",
    "policePercent",
    "roadPercent",
    "firePercent",
    "roadSpend",
    "policeSpend",
    "fireSpend",
    "roadMaintenanceBudget",
    "policeMaintenanceBudget",
    "fireMaintenanceBudget",
    "cityTax",
    "roadEffect",
    "policeEffect",
    "fireEffect"
  ];
  Budget.prototype.save = function(saveData) {
    for (var i = 0, l = saveProps2.length; i < l; i++)
      saveData[saveProps2[i]] = this[saveProps2[i]];
  };
  Budget.prototype.load = function(saveData) {
    for (var i = 0, l = saveProps2.length; i < l; i++)
      this[saveProps2[i]] = saveData[saveProps2[i]];
    this._emitEvent(AUTOBUDGET_CHANGED, this.autoBudget);
    this._emitEvent(FUNDS_CHANGED, this.totalFunds);
  };
  Budget.prototype.setAutoBudget = function(value) {
    this.autoBudget = value;
    this._emitEvent(AUTOBUDGET_CHANGED, this.autoBudget);
  };
  var RLevels = [0.7, 0.9, 1.2];
  var FLevels = [1.4, 1.2, 0.8];
  Budget.prototype._calculateBestPercentages = function() {
    this.roadSpend = Math.round(this.roadMaintenanceBudget * this.roadPercent);
    this.fireSpend = Math.round(this.fireMaintenanceBudget * this.firePercent);
    this.policeSpend = Math.round(this.policeMaintenanceBudget * this.policePercent);
    var total = this.roadSpend + this.fireSpend + this.policeSpend;
    if (total === 0) {
      this.roadPercent = 1;
      this.firePercent = 1;
      this.policePercent = 1;
      return { road: 1, fire: 1, police: 1 };
    }
    var roadCost = 0;
    var fireCost = 0;
    var policeCost = 0;
    var cashRemaining = this.totalFunds + this.taxFund;
    if (cashRemaining >= this.roadSpend)
      roadCost = this.roadSpend;
    else
      roadCost = cashRemaining;
    cashRemaining -= roadCost;
    if (cashRemaining >= this.fireSpend)
      fireCost = this.fireSpend;
    else
      fireCost = cashRemaining;
    cashRemaining -= fireCost;
    if (cashRemaining >= this.policeSpend)
      policeCost = this.policeSpend;
    else
      policeCost = cashRemaining;
    cashRemaining -= policeCost;
    if (this.roadMaintenanceBudget > 0)
      this.roadPercent = (roadCost / this.roadMaintenanceBudget).toPrecision(2) - 0;
    else
      this.roadPercent = 1;
    if (this.fireMaintenanceBudget > 0)
      this.firePercent = (fireCost / this.fireMaintenanceBudget).toPrecision(2) - 0;
    else
      this.firePercent = 1;
    if (this.policeMaintenanceBudget > 0)
      this.policePercent = (policeCost / this.policeMaintenanceBudget).toPrecision(2) - 0;
    else
      this.policePercent = 1;
    return { road: roadCost, police: policeCost, fire: fireCost };
  };
  Budget.prototype.doBudgetWindow = function() {
    return this.doBudgetNow(true);
  };
  Budget.prototype.doBudgetNow = function(fromWindow) {
    var costs = this._calculateBestPercentages();
    if (!this.autoBudget && !fromWindow) {
      this.autoBudget = false;
      this.awaitingValues = true;
      this._emitEvent(BUDGET_NEEDED);
      return;
    }
    var roadCost = costs.road;
    var policeCost = costs.police;
    var fireCost = costs.fire;
    var totalCost = roadCost + policeCost + fireCost;
    var cashRemaining = this.totalFunds + this.taxFund - totalCost;
    if (cashRemaining > 0 && this.autoBudget || fromWindow) {
      this.awaitingValues = false;
      this.doBudgetSpend(roadCost, fireCost, policeCost);
      return;
    }
    this.setAutoBudget(false);
    this.awaitingValues = true;
    this._emitEvent(BUDGET_NEEDED);
    this._emitEvent(NO_MONEY);
  };
  Budget.prototype.doBudgetSpend = function(roadValue, fireValue, policeValue) {
    this.roadSpend = roadValue;
    this.fireSpend = fireValue;
    this.policeSpend = policeValue;
    var total = this.roadSpend + this.fireSpend + this.policeSpend;
    this.spend(-(this.taxFund - total));
    this.updateFundEffects();
  };
  Budget.prototype.updateFundEffects = function() {
    this.roadSpend = Math.round(this.roadMaintenanceBudget * this.roadPercent);
    this.fireSpend = Math.round(this.fireMaintenanceBudget * this.firePercent);
    this.policeSpend = Math.round(this.policeMaintenanceBudget * this.policePercent);
    this.roadEffect = this.MAX_ROAD_EFFECT;
    this.policeEffect = this.MAX_POLICESTATION_EFFECT;
    this.fireEffect = this.MAX_FIRESTATION_EFFECT;
    if (this.roadMaintenanceBudget > 0)
      this.roadEffect = Math.floor(this.roadEffect * this.roadSpend / this.roadMaintenanceBudget);
    if (this.fireMaintenanceBudget > 0)
      this.fireEffect = Math.floor(this.fireEffect * this.fireSpend / this.fireMaintenanceBudget);
    if (this.policeMaintenanceBudget > 0)
      this.policeEffect = Math.floor(this.policeEffect * this.policeSpend / this.policeMaintenanceBudget);
  };
  Budget.prototype.collectTax = function(gameLevel, census) {
    this.cashFlow = 0;
    this.policeMaintenanceBudget = census.policeStationPop * policeMaintenanceCost;
    this.fireMaintenanceBudget = census.fireStationPop * fireMaintenanceCost;
    var roadCost = census.roadTotal * roadMaintenanceCost;
    var railCost = census.railTotal * railMaintenanceCost;
    this.roadMaintenanceBudget = Math.floor((roadCost + railCost) * RLevels[gameLevel]);
    this.taxFund = Math.floor(Math.floor(census.totalPop * census.landValueAverage / 120) * this.cityTax * FLevels[gameLevel]);
    if (census.totalPop > 0) {
      this.cashFlow = this.taxFund - (this.policeMaintenanceBudget + this.fireMaintenanceBudget + this.roadMaintenanceBudget);
      this.doBudgetNow(false);
    } else {
      this.roadEffect = this.MAX_ROAD_EFFECT;
      this.policeEffect = this.MAX_POLICESTATION_EFFECT;
      this.fireEffect = this.MAX_FIRESTATION_EFFECT;
    }
  };
  Budget.prototype.setTax = function(amount) {
    if (amount === this.cityTax)
      return;
    this.cityTax = amount;
  };
  Budget.prototype.setFunds = function(amount) {
    if (amount === this.totalFunds)
      return;
    this.totalFunds = Math.max(0, amount);
    this._emitEvent(FUNDS_CHANGED, this.totalFunds);
    if (this.totalFunds === 0)
      this._emitEvent(NO_MONEY);
  };
  Budget.prototype.spend = function(amount) {
    this.setFunds(this.totalFunds - amount);
  };
  Budget.prototype.shouldDegradeRoad = function() {
    return this.roadEffect < Math.floor(15 * this.MAX_ROAD_EFFECT / 16);
  };

  // external/micropolisjs/src/census.js
  var arrs = [
    "res",
    "com",
    "ind",
    "crime",
    "money",
    "pollution"
  ];
  function Census() {
    this.clearCensus();
    this.changed = false;
    this.crimeRamp = 0;
    this.pollutionRamp = 0;
    this.landValueAverage = 0;
    this.pollutionAverage = 0;
    this.crimeAverage = 0;
    this.totalPop = 0;
    var createArray = function(arrName) {
      this[arrName] = [];
      for (var a = 0; a < 120; a++)
        this[arrName][a] = 0;
    };
    for (var i = 0; i < arrs.length; i++) {
      var name10 = arrs[i] + "Hist10";
      var name120 = arrs[i] + "Hist120";
      createArray.call(this, name10);
      createArray.call(this, name120);
    }
  }
  var rotate10Arrays = function() {
    for (var i = 0; i < arrs.length; i++) {
      var name10 = arrs[i] + "Hist10";
      this[name10].pop();
      this[name10].unshift(0);
    }
  };
  var rotate120Arrays = function() {
    for (var i = 0; i < arrs.length; i++) {
      var name120 = arrs[i] + "Hist120";
      this[name120].pop();
      this[name120].unshift(0);
    }
  };
  Census.prototype.clearCensus = function() {
    this.poweredZoneCount = 0;
    this.unpoweredZoneCount = 0;
    this.firePop = 0;
    this.roadTotal = 0;
    this.railTotal = 0;
    this.resPop = 0;
    this.comPop = 0;
    this.indPop = 0;
    this.resZonePop = 0;
    this.comZonePop = 0;
    this.indZonePop = 0;
    this.hospitalPop = 0;
    this.churchPop = 0;
    this.policeStationPop = 0;
    this.fireStationPop = 0;
    this.stadiumPop = 0;
    this.coalPowerPop = 0;
    this.nuclearPowerPop = 0;
    this.seaportPop = 0;
    this.airportPop = 0;
  };
  var saveProps3 = [
    "resPop",
    "comPop",
    "indPop",
    "crimeRamp",
    "pollutionRamp",
    "landValueAverage",
    "pollutionAverage",
    "crimeAverage",
    "totalPop",
    "resHist10",
    "resHist120",
    "comHist10",
    "comHist120",
    "indHist10",
    "indHist120",
    "crimeHist10",
    "crimeHist120",
    "moneyHist10",
    "moneyHist120",
    "pollutionHist10",
    "pollutionHist120"
  ];
  Census.prototype.save = function(saveData) {
    for (var i = 0, l = saveProps3.length; i < l; i++)
      saveData[saveProps3[i]] = this[saveProps3[i]];
  };
  Census.prototype.load = function(saveData) {
    for (var i = 0, l = saveProps3.length; i < l; i++)
      this[saveProps3[i]] = saveData[saveProps3[i]];
  };
  Census.prototype.take10Census = function(budget) {
    var resPopDenom = 8;
    rotate10Arrays.call(this);
    this.resHist10[0] = Math.floor(this.resPop / resPopDenom);
    this.comHist10[0] = this.comPop;
    this.indHist10[0] = this.indPop;
    this.crimeRamp += Math.floor((this.crimeAverage - this.crimeRamp) / 4);
    this.crimeHist10[0] = Math.min(this.crimeRamp, 255);
    this.pollutionRamp += Math.floor((this.pollutionAverage - this.pollutionRamp) / 4);
    this.pollutionHist10[0] = Math.min(this.pollutionRamp, 255);
    var x = Math.floor(budget.cashFlow / 20) + 128;
    this.moneyHist10[0] = MiscUtils.clamp(x, 0, 255);
    var resPopScaled = this.resPop >> 8;
    if (this.hospitalPop < this.resPopScaled)
      this.needHospital = 1;
    else if (this.hospitalPop > this.resPopScaled)
      this.needHospital = -1;
    else if (this.hospitalPop === this.resPopScaled)
      this.needHospital = 0;
    this.changed = true;
  };
  Census.prototype.take120Census = function() {
    rotate120Arrays.call(this);
    var resPopDenom = 8;
    this.resHist120[0] = Math.floor(this.resPop / resPopDenom);
    this.comHist120[0] = this.comPop;
    this.indHist120[0] = this.indPop;
    this.crimeHist120[0] = this.crimeHist10[0];
    this.pollutionHist120[0] = this.pollutionHist10[0];
    this.moneyHist120[0] = this.moneyHist10[0];
    this.changed = true;
  };

  // external/micropolisjs/src/disasterManager.js
  var DisasterManager = EventEmitter(function(map, spriteManager, gameLevel) {
    this._map = map;
    this._spriteManager = spriteManager;
    this._gameLevel = gameLevel;
    this._floodCount = 0;
    this.disastersEnabled = false;
  });
  var DisChance = [479, 239, 59];
  DisasterManager.prototype.doDisasters = function(census) {
    if (this._floodCount)
      this._floodCount--;
    if (!this.disastersEnabled)
      return;
    if (!Random.getRandom(DisChance[this._gameLevel])) {
      switch (Random.getRandom(8)) {
        case 0:
        case 1:
          this.setFire();
          break;
        case 2:
        case 3:
          this.makeFlood();
          break;
        case 4:
          break;
        case 5:
          this._spriteManager.makeTornado();
          break;
        case 6:
          break;
        case 7:
        case 8:
          if (census.pollutionAverage > 60)
            this._spriteManager.makeMonster();
          break;
      }
    }
  };
  DisasterManager.prototype.scenarioDisaster = function() {
  };
  DisasterManager.prototype.makeMeltdown = function() {
    for (var x = 0; x < this._map.width - 1; x++) {
      for (var y = 0; y < this._map.height - 1; y++) {
        if (this._map.getTileValue(x, y) === NUCLEAR) {
          this.doMeltdown(x, y);
          return;
        }
      }
    }
  };
  var vulnerable = function(tile3) {
    var tileValue = tile3.getValue();
    if (tileValue < RESBASE || tileValue > LASTZONE || tile3.isZone())
      return false;
    return true;
  };
  DisasterManager.prototype.makeEarthquake = function() {
    var strength = Random.getRandom(700) + 300;
    this.doEarthquake(strength);
    this._emitEvent(EARTHQUAKE, { x: this._map.cityCenterX, y: this._map.cityCenterY });
    for (var i = 0; i < strength; i++) {
      var x = Random.getRandom(this._map.width - 1);
      var y = Random.getRandom(this._map.height - 1);
      if (!this._map.testBounds(x, y))
        continue;
      if (vulnerable(this._map.getTile(x, y))) {
        if ((i & 3) !== 0)
          this._map.setTo(x, y, TileUtils.randomRubble());
        else
          this._map.setTo(x, y, TileUtils.randomFire());
      }
    }
  };
  DisasterManager.prototype.setFire = function(times, zonesOnly) {
    times = times || 1;
    zonesOnly = zonesOnly || false;
    for (var i = 0; i < times; i++) {
      var x = Random.getRandom(this._map.width - 1);
      var y = Random.getRandom(this._map.height - 1);
      if (!this._map.testBounds(x, y))
        continue;
      var tile3 = this._map.getTile(x, y);
      if (!tile3.isZone()) {
        tile3 = tile3.getValue();
        var lowerLimit = zonesOnly ? LHTHR : TREEBASE;
        if (tile3 > lowerLimit && tile3 < LASTZONE) {
          this._map.setTo(x, y, TileUtils.randomFire());
          this._emitEvent(FIRE_REPORTED, { showable: true, x, y });
          return;
        }
      }
    }
  };
  DisasterManager.prototype.makeCrash = function() {
    var s = this._spriteManager.getSprite(SPRITE_AIRPLANE);
    if (s !== null) {
      s.explodeSprite();
      return;
    }
    var x = Random.getRandom(this._map.width - 1);
    var y = Random.getRandom(this._map.height - 1);
    this._spriteManager.generatePlane(x, y);
    s = this._spriteManager.getSprite(SPRITE_AIRPLANE);
    s.explodeSprite();
  };
  DisasterManager.prototype.makeFire = function() {
    this.setFire(40, false);
  };
  var Dx = [0, 1, 0, -1];
  var Dy = [-1, 0, 1, 0];
  DisasterManager.prototype.makeFlood = function() {
    for (var i = 0; i < 300; i++) {
      var x = Random.getRandom(this._map.width - 1);
      var y = Random.getRandom(this._map.height - 1);
      if (!this._map.testBounds(x, y))
        continue;
      var tileValue = this._map.getTileValue(x, y);
      if (tileValue > CHANNEL && tileValue <= WATER_HIGH) {
        for (var j = 0; j < 4; j++) {
          var xx = x + Dx[j];
          var yy = y + Dy[j];
          if (!this._map.testBounds(xx, yy))
            continue;
          var tile3 = this._map.getTile(xx, yy);
          tileValue = tile3.getValue();
          if (tile3 === DIRT || tile3.isBulldozable() && tile3.isCombustible) {
            this._map.setTile(xx, yy, FLOOD, 0);
            this._floodCount = 30;
            this._emitEvent(FLOODING_REPORTED, { showable: true, x: xx, y: yy });
            return;
          }
        }
      }
    }
  };
  DisasterManager.prototype.doFlood = function(x, y, blockMaps) {
    if (this._floodCount > 0) {
      for (var i = 0; i < 4; i++) {
        if (Random.getChance(7)) {
          var xx = x + Dx[i];
          var yy = y + Dy[i];
          if (this._map.testBounds(xx, yy)) {
            var tile3 = this._map.getTile(xx, yy);
            var tileValue = tile3.getValue();
            if (tile3.isCombustible() || tileValue === DIRT || tileValue >= WOODS5 && tileValue < FLOOD) {
              if (tile3.isZone())
                ZoneUtils.fireZone(this._map, xx, yy, blockMaps);
              this._map.setTile(xx, yy, FLOOD + Random.getRandom(2), 0);
            }
          }
        }
      }
    } else {
      if (Random.getChance(15))
        this._map.setTile(x, y, DIRT, 0);
    }
  };
  DisasterManager.prototype.doMeltdown = function(x, y) {
    this._spriteManager.makeExplosion(x - 1, y - 1);
    this._spriteManager.makeExplosion(x - 1, y + 2);
    this._spriteManager.makeExplosion(x + 2, y - 1);
    this._spriteManager.makeExplosion(x + 2, y + 2);
    var dY, dX;
    for (dX = x - 1; dX < x + 3; dX++) {
      for (dY = y - 1; dY < y + 3; dY++) {
        this._map.setTo(dX, dY, TileUtils.randomFire());
      }
    }
    for (var i = 0; i < 200; i++) {
      dX = x - 20 + Random.getRandom(40);
      dY = y - 15 + Random.getRandom(30);
      if (!this._map.testBounds(dX, dY))
        continue;
      var tile3 = this._map.getTile(dX, dY);
      if (tile3.isZone())
        continue;
      if (tile3.isCombustible() || tile3.getValue() === DIRT)
        this._map.setTile(dX, dY, RADTILE, 0);
    }
    this._emitEvent(NUCLEAR_MELTDOWN, { showable: true, x, y });
  };

  // external/micropolisjs/src/emergencyServices.js
  var handleService = function(censusStat, budgetEffect, blockMap) {
    return function(map, x, y, simData) {
      simData.census[censusStat] += 1;
      var effect = simData.budget[budgetEffect];
      var isPowered = map.getTile(x, y).isPowered();
      if (!isPowered)
        effect = Math.floor(effect / 2);
      var pos2 = new Position(x, y);
      var connectedToRoads = simData.trafficManager.findPerimeterRoad(pos2);
      if (!connectedToRoads)
        effect = Math.floor(effect / 2);
      var currentEffect = simData.blockMaps[blockMap].worldGet(x, y);
      currentEffect += effect;
      simData.blockMaps[blockMap].worldSet(x, y, currentEffect);
    };
  };
  var policeStationFound = handleService("policeStationPop", "policeEffect", "policeStationMap");
  var fireStationFound = handleService("fireStationPop", "fireEffect", "fireStationMap");
  var EmergencyServices = {
    registerHandlers: function(mapScanner, repairManager) {
      mapScanner.addAction(POLICESTATION, policeStationFound);
      mapScanner.addAction(FIRESTATION, fireStationFound);
    }
  };

  // external/micropolisjs/src/evaluation.js
  var PROBLEMS = [
    "CVP_CRIME",
    "CVP_POLLUTION",
    "CVP_HOUSING",
    "CVP_TAXES",
    "CVP_TRAFFIC",
    "CVP_UNEMPLOYMENT",
    "CVP_FIRE"
  ];
  var NUMPROBLEMS = PROBLEMS.length;
  var NUM_COMPLAINTS = 4;
  var problemData = [];
  var Evaluation = EventEmitter(function(gameLevel) {
    this.problemVotes = [];
    this.problemOrder = [];
    this.evalInit();
    this.gameLevel = "" + gameLevel;
  });
  Evaluation.prototype.cityEvaluation = function(simData) {
    var census = simData.census;
    if (census.totalPop > 0) {
      for (var i = 0; i < NUMPROBLEMS; i++)
        problemData.push(0);
      this.getAssessedValue(census);
      this.getPopulation(census);
      this.doProblems(simData.census, simData.budget, simData.blockMaps);
      this.getScore(simData);
      this.doVotes();
    } else {
      this.evalInit();
      this.cityYes = 50;
    }
  };
  Evaluation.prototype.evalInit = function() {
    this.cityYes = 0;
    this.cityPop = 0;
    this.cityPopDelta = 0;
    this.cityAssessedValue = 0;
    this.cityClass = Evaluation.CC_VILLAGE;
    this.cityClassLast = Evaluation.CC_VILLAGE;
    this.cityScore = 500;
    this.cityScoreDelta = 0;
    for (var i = 0; i < NUMPROBLEMS; i++)
      this.problemVotes[i] = { index: i, voteCount: 0 };
    for (i = 0; i < NUM_COMPLAINTS; i++)
      this.problemOrder[i] = NUMPROBLEMS;
  };
  var saveProps4 = ["cityClass", "cityScore"];
  Evaluation.prototype.save = function(saveData) {
    for (var i = 0, l = saveProps4.length; i < l; i++)
      saveData[saveProps4[i]] = this[saveProps4[i]];
  };
  Evaluation.prototype.load = function(saveData) {
    for (var i = 0, l = saveProps4.length; i < l; i++)
      this[saveProps4[i]] = saveData[saveProps4[i]];
  };
  Evaluation.prototype.getAssessedValue = function(census) {
    var value;
    value = census.roadTotal * 5;
    value += census.railTotal * 10;
    value += census.policeStationPop * 1e3;
    value += census.fireStationPop * 1e3;
    value += census.hospitalPop * 400;
    value += census.stadiumPop * 3e3;
    value += census.seaportPop * 5e3;
    value += census.airportPop * 1e4;
    value += census.coalPowerPop * 3e3;
    value += census.nuclearPowerPop * 6e3;
    this.cityAssessedValue = value * 1e3;
  };
  Evaluation.prototype.getPopulation = function(census) {
    var oldPopulation = this.cityPop;
    this.cityPop = (census.resPop + (census.comPop + census.indPop) * 8) * 20;
    this.cityPopDelta = this.cityPop - oldPopulation;
    if (this.cityPopDelta !== 0)
      this._emitEvent(POPULATION_UPDATED, this.cityPop);
    return this.cityPop;
  };
  Evaluation.prototype.getCityClass = function(cityPopulation) {
    this.cityClass = Evaluation.CC_VILLAGE;
    if (cityPopulation > 2e3)
      this.cityClass = Evaluation.CC_TOWN;
    if (cityPopulation > 1e4)
      this.cityClass = Evaluation.CC_CITY;
    if (cityPopulation > 5e4)
      this.cityClass = Evaluation.CC_CAPITAL;
    if (cityPopulation > 1e5)
      this.cityClass = Evaluation.CC_METROPOLIS;
    if (cityPopulation > 5e5)
      this.cityClass = Evaluation.CC_MEGALOPOLIS;
    if (this.cityClass !== this.cityClassLast) {
      this.cityClassLast = this.cityClass;
      this._emitEvent(CLASSIFICATION_UPDATED, this.cityClass);
    }
    return this.cityClass;
  };
  Evaluation.prototype.voteProblems = function() {
    for (var i = 0; i < NUMPROBLEMS; i++) {
      this.problemVotes[i].index = i;
      this.problemVotes[i].voteCount = 0;
    }
    var problem = 0;
    var voteCount = 0;
    var loopCount = 0;
    while (voteCount < 100 && loopCount < 600) {
      var voterProblemTolerance = Random.getRandom(300);
      if (problemData[problem] > voterProblemTolerance) {
        this.problemVotes[problem].voteCount += 1;
        voteCount++;
      }
      problem = (problem + 1) % NUMPROBLEMS;
      loopCount++;
    }
  };
  var getTrafficAverage = function(blockMaps, census) {
    var trafficDensityMap = blockMaps.trafficDensityMap;
    var landValueMap = blockMaps.landValueMap;
    var trafficTotal = 0;
    var count = 1;
    for (var x = 0; x < landValueMap.gameMapWidth; x += landValueMap.blockSize) {
      for (var y = 0; y < landValueMap.gameMapHeight; y += landValueMap.blockSize) {
        if (landValueMap.worldGet(x, y) > 0) {
          trafficTotal += trafficDensityMap.worldGet(x, y);
          count++;
        }
      }
    }
    var trafficAverage = census.trafficAverage = Math.floor(trafficTotal / count) * 2.4;
    return trafficAverage;
  };
  var getUnemployment = function(census) {
    var b = (census.comPop + census.indPop) * 8;
    if (b === 0)
      return 0;
    var r = census.resPop / b;
    b = Math.round((r - 1) * 255);
    return Math.min(b, 255);
  };
  var getFireSeverity = function(census) {
    return Math.min(census.firePop * 5, 255);
  };
  Evaluation.prototype.doProblems = function(census, budget, blockMaps) {
    problemData[Evaluation.CRIME] = census.crimeAverage;
    problemData[Evaluation.POLLUTION] = census.pollutionAverage;
    problemData[Evaluation.HOUSING] = census.landValueAverage * 7 / 10;
    problemData[Evaluation.TAXES] = budget.cityTax * 10;
    problemData[Evaluation.TRAFFIC] = getTrafficAverage(blockMaps, census);
    problemData[Evaluation.UNEMPLOYMENT] = getUnemployment(census);
    problemData[Evaluation.FIRE] = getFireSeverity(census);
    this.voteProblems();
    this.problemVotes.sort(function(a, b) {
      return b.voteCount - a.voteCount;
    });
    this.problemOrder = this.problemVotes.map(function(pv, i) {
      if (i >= NUM_COMPLAINTS || pv.voteCount === 0)
        return null;
      return pv.index;
    });
  };
  Evaluation.prototype.getScore = function(simData) {
    var census = simData.census;
    var budget = simData.budget;
    var valves = simData.valves;
    var cityScoreLast = this.cityScore;
    var score = 0;
    for (var i = 0; i < NUMPROBLEMS; i++)
      score += problemData[i];
    score = Math.floor(score / 3);
    score = (250 - Math.min(score, 250)) * 4;
    var demandPenalty = 0.85;
    if (valves.resCap)
      score = Math.round(score * demandPenalty);
    if (valves.comCap)
      score = Math.round(score * demandPenalty);
    if (valves.indCap)
      score = Math.round(score * demandPenalty);
    if (budget.roadEffect < budget.MAX_ROAD_EFFECT)
      score -= budget.MAX_ROAD_EFFECT - budget.roadEffect;
    if (budget.policeEffect < budget.MAX_POLICE_STATION_EFFECT)
      score = Math.round(score * (0.9 + budget.policeEffect / (10 * budget.MAX_POLICE_STATION_EFFECT)));
    if (budget.fireEffect < budget.MAX_FIRE_STATION_EFFECT)
      score = Math.round(score * (0.9 + budget.fireEffect / (10 * budget.MAX_FIRE_STATION_EFFECT)));
    if (valves.resValve < -1e3)
      score = Math.round(score * 0.85);
    if (valves.comValve < -1e3)
      score = Math.round(score * 0.85);
    if (valves.indValve < -1e3)
      score = Math.round(score * 0.85);
    var scale = 1;
    if (this.cityPop === 0 || this.cityPopDelta === 0 || this.cityPopDelta === this.cityPop) {
      scale = 1;
    } else if (this.cityPopDelta > 0) {
      scale = this.cityPopDelta / this.cityPop + 1;
    } else if (this.cityPopDelta < 0) {
      scale = 0.95 + Math.floor(this.cityPopDelta / (this.cityPop - this.cityPopDelta));
    }
    score = Math.round(score * scale);
    score = score - getFireSeverity(census) - budget.cityTax;
    scale = census.unpoweredZoneCount + census.poweredZoneCount;
    if (scale > 0)
      score = Math.round(score * (census.poweredZoneCount / scale));
    score = MiscUtils.clamp(score, 0, 1e3);
    this.cityScore = Math.round((this.cityScore + score) / 2);
    this.cityScoreDelta = this.cityScore - cityScoreLast;
    if (this.cityScoreDelta !== 0)
      this._emitEvent(SCORE_UPDATED, this.cityScore);
  };
  Evaluation.prototype.doVotes = function() {
    this.cityYes = 0;
    for (var i = 0; i < 100; i++) {
      var voterExpectation = Random.getRandom(1e3);
      if (this.cityScore > voterExpectation)
        this.cityYes++;
    }
  };
  Evaluation.prototype.getProblemNumber = function(i) {
    if (i < 0 || i >= NUM_COMPLAINTS)
      return null;
    return this.problemOrder[i];
  };
  Object.defineProperties(
    Evaluation,
    {
      CC_VILLAGE: MiscUtils.makeConstantDescriptor("VILLAGE"),
      CC_TOWN: MiscUtils.makeConstantDescriptor("TOWN"),
      CC_CITY: MiscUtils.makeConstantDescriptor("CITY"),
      CC_CAPITAL: MiscUtils.makeConstantDescriptor("CAPITAL"),
      CC_METROPOLIS: MiscUtils.makeConstantDescriptor("METROPOLIS"),
      CC_MEGALOPOLIS: MiscUtils.makeConstantDescriptor("MEGALOPOLIS"),
      CRIME: MiscUtils.makeConstantDescriptor(0),
      POLLUTION: MiscUtils.makeConstantDescriptor(1),
      HOUSING: MiscUtils.makeConstantDescriptor(2),
      TAXES: MiscUtils.makeConstantDescriptor(3),
      TRAFFIC: MiscUtils.makeConstantDescriptor(4),
      UNEMPLOYMENT: MiscUtils.makeConstantDescriptor(5),
      FIRE: MiscUtils.makeConstantDescriptor(6)
    }
  );

  // external/micropolisjs/src/mapScanner.js
  var tile2 = new Tile();
  function MapScanner(map) {
    this._map = map;
    this._actions = [];
  }
  var isCallable = function(f) {
    return typeof f === "function";
  };
  MapScanner.prototype.addAction = function(criterion, action) {
    this._actions.push({ criterion, action });
  };
  MapScanner.prototype.mapScan = function(startX, maxX, simData) {
    for (var y = 0; y < this._map.height; y++) {
      for (var x = startX; x < maxX; x++) {
        this._map.getTile(x, y, tile2);
        var tileValue = tile2.getValue();
        if (tileValue < FLOOD)
          continue;
        if (tile2.isConductive())
          simData.powerManager.setTilePower(x, y);
        if (tile2.isZone()) {
          simData.repairManager.checkTile(x, y, simData.cityTime);
          var powered = tile2.isPowered();
          if (powered)
            simData.census.poweredZoneCount += 1;
          else
            simData.census.unpoweredZoneCount += 1;
        }
        for (var i = 0, l = this._actions.length; i < l; i++) {
          var current = this._actions[i];
          var callable = isCallable(current.criterion);
          if (callable && current.criterion.call(null, tile2)) {
            current.action.call(null, this._map, x, y, simData);
            break;
          } else if (!callable && current.criterion === tileValue) {
            current.action.call(null, this._map, x, y, simData);
            break;
          }
        }
      }
    }
  };

  // external/micropolisjs/src/miscTiles.js
  var xDelta2 = [-1, 0, 1, 0];
  var yDelta2 = [0, -1, 0, 1];
  var fireFound = function(map, x, y, simData) {
    simData.census.firePop += 1;
    if ((Random.getRandom16() & 3) !== 0)
      return;
    for (var i = 0; i < 4; i++) {
      if (Random.getChance(7)) {
        var xTem = x + xDelta2[i];
        var yTem = y + yDelta2[i];
        if (map.testBounds(xTem, yTem)) {
          var tile3 = map.getTile(x, y);
          if (!tile3.isCombustible())
            continue;
          if (tile3.isZone()) {
            ZoneUtils.fireZone(map, x, y, simData.blockMaps);
            if (tile3.getValue() > IZB)
              simData.spriteManager.makeExplosionAt(x, y);
          }
          map.setTo(tileUtils.randomFire());
        }
      }
    }
    var rate = 10;
    i = simData.blockMaps.fireStationEffectMap.worldGet(x, y);
    if (i > 100)
      rate = 1;
    else if (i > 20)
      rate = 2;
    else if (i > 0)
      rate = 3;
    if (Random.getRandom(rate) === 0)
      map.setTo(x, y, TileUtils.randomRubble());
  };
  var radiationFound = function(map, x, y, simData) {
    if (Random.getChance(4095))
      map.setTile(x, y, DIRT, 0);
  };
  var floodFound = function(map, x, y, simData) {
    simData.disasterManager.doFlood(x, y, simData.blockMaps);
  };
  var MiscTiles = {
    registerHandlers: function(mapScanner, repairManager) {
      mapScanner.addAction(TileUtils.isFire, fireFound, true);
      mapScanner.addAction(RADTILE, radiationFound, true);
      mapScanner.addAction(TileUtils.isFlood, floodFound, true);
    }
  };

  // external/micropolisjs/src/powerManager.js
  var COAL_POWER_STRENGTH = 700;
  var NUCLEAR_POWER_STRENGTH = 2e3;
  var PowerManager = EventEmitter(function(map) {
    this._map = map;
    this._powerStack = [];
    this.powerGridMap = new BlockMap(this._map.width, this._map.height, 1);
  });
  PowerManager.prototype.setTilePower = function(x, y) {
    var tile3 = this._map.getTile(x, y);
    var tileValue = tile3.getValue();
    if (tileValue === NUCLEAR || tileValue === POWERPLANT || this.powerGridMap.worldGet(x, y) > 0) {
      tile3.addFlags(POWERBIT);
      return;
    }
    tile3.removeFlags(POWERBIT);
  };
  PowerManager.prototype.clearPowerStack = function() {
    this._powerStackPointer = 0;
    this._powerStack = [];
  };
  PowerManager.prototype.testForConductive = function(pos2, testDir) {
    var movedPos = Position.move(pos2, testDir);
    if (this._map.isPositionInBounds(movedPos)) {
      if (this._map.getTile(movedPos.x, movedPos.y).isConductive()) {
        if (this.powerGridMap.worldGet(movedPos.x, movedPos.y) === 0)
          return true;
      }
    }
    return false;
  };
  PowerManager.prototype.doPowerScan = function(census) {
    this.powerGridMap.clear();
    var maxPower = census.coalPowerPop * COAL_POWER_STRENGTH + census.nuclearPowerPop * NUCLEAR_POWER_STRENGTH;
    var powerConsumption = 0;
    while (this._powerStack.length > 0) {
      var pos2 = this._powerStack.pop();
      var anyDir = void 0;
      var conNum;
      do {
        powerConsumption++;
        if (powerConsumption > maxPower) {
          this._emitEvent(NOT_ENOUGH_POWER);
          return;
        }
        if (anyDir)
          pos2 = Position.move(pos2, anyDir);
        this.powerGridMap.worldSet(pos2.x, pos2.y, 1);
        conNum = 0;
        forEachCardinalDirection((dir) => {
          if (conNum >= 2) {
            return;
          }
          if (this.testForConductive(pos2, dir)) {
            conNum++;
            anyDir = dir;
          }
        });
        if (conNum > 1)
          this._powerStack.push(new Position(pos2.x, pos2.y));
      } while (conNum);
    }
  };
  PowerManager.prototype.coalPowerFound = function(map, x, y, simData) {
    simData.census.coalPowerPop += 1;
    this._powerStack.push(new Position(x, y));
    var dX = [-1, 2, 1, 2];
    var dY = [-1, -1, 0, 0];
    for (var i = 0; i < 4; i++)
      map.addTileFlags(x + dX[i], y + dY[i], ANIMBIT);
  };
  var meltdownTable = [3e4, 2e4, 1e4];
  PowerManager.prototype.nuclearPowerFound = function(map, x, y, simData) {
    if (simData.disasterManager.disastersEnabled && Random.getRandom(meltdownTable[simData.gameLevel]) === 0) {
      simData.disasterManager.doMeltdown(x, y);
      return;
    }
    simData.census.nuclearPowerPop += 1;
    this._powerStack.push(new Position(x, y));
    for (var i = 0; i < 4; i++)
      map.addTileFlags(x, y, ANIMBIT | CONDBIT | POWERBIT | BURNBIT);
  };
  PowerManager.prototype.registerHandlers = function(mapScanner, repairManager) {
    mapScanner.addAction(POWERPLANT, this.coalPowerFound.bind(this));
    mapScanner.addAction(NUCLEAR, this.nuclearPowerFound.bind(this));
    repairManager.addAction(POWERPLANT, 7, 4);
    repairManager.addAction(NUCLEAR, 7, 4);
  };

  // external/micropolisjs/src/repairManager.js
  function RepairManager(map) {
    this._map = map;
    this._actions = [];
  }
  var isCallable2 = function(f) {
    return typeof f === "function";
  };
  RepairManager.prototype.addAction = function(criterion, period, zoneSize) {
    this._actions.push({ criterion, period, zoneSize });
  };
  RepairManager.prototype.repairZone = function(x, y, zoneSize) {
    var centre = this._map.getTileValue(x, y);
    var tileValue = centre - zoneSize - 2;
    for (var yy = -1; yy < zoneSize - 1; yy++) {
      for (var xx = -1; xx < zoneSize - 1; xx++) {
        tileValue++;
        var current = this._map.getTile(x + xx, y + yy);
        if (current.isZone() || current.isAnimated())
          continue;
        var currentValue = current.getValue();
        if (currentValue < RUBBLE || currentValue >= ROADBASE)
          this._map.setTile(x + xx, y + yy, tileValue, CONDBIT | BURNBIT);
      }
    }
  };
  RepairManager.prototype.checkTile = function(x, y, cityTime) {
    for (var i = 0, l = this._actions.length; i < l; i++) {
      var current = this._actions[i];
      var period = current.period;
      if ((cityTime & period) !== 0)
        continue;
      var tile3 = this._map.getTile(x, y);
      var tileValue = tile3.getValue();
      var callable = isCallable2(current.criterion);
      if (callable && current.criterion.call(null, tile3))
        this.repairZone(x, y, current.zoneSize);
      else if (!callable && current.criterion === tileValue)
        this.repairZone(x, y, current.zoneSize);
    }
  };

  // external/micropolisjs/src/road.js
  var openBridge = function(map, origX, origY, xDelta9, yDelta9, oldTiles, newTiles) {
    for (var i = 0; i < 7; i++) {
      var x = origX + xDelta9[i];
      var y = origY + yDelta9[i];
      if (map.testBounds(x, y)) {
        if (map.getTileValue(x, y) === (oldTiles[i] & BIT_MASK))
          map.setTileValue(x, y, newTiles[i]);
      }
    }
  };
  var closeBridge = function(map, origX, origY, xDelta9, yDelta9, oldTiles, newTiles) {
    for (var i = 0; i < 7; i++) {
      var x = origX + xDelta9[i];
      var y = origY + yDelta9[i];
      if (map.testBounds(x, y)) {
        var tileValue = map.getTileValue(x, y);
        if (tileValue === CHANNEL || (tileValue & 15) === (oldTiles[i] & 15))
          map.setTileValue(x, y, newTiles[i]);
      }
    }
  };
  var verticalDeltaX = [0, 1, 0, 0, 0, 0, 1];
  var verticalDeltaY = [-2, -2, -1, 0, 1, 2, 2];
  var openVertical = [
    VBRDG0 | BULLBIT,
    VBRDG1 | BULLBIT,
    RIVER,
    BRWV | BULLBIT,
    RIVER,
    VBRDG2 | BULLBIT,
    VBRDG3 | BULLBIT
  ];
  var closeVertical = [
    VBRIDGE | BULLBIT,
    RIVER,
    VBRIDGE | BULLBIT,
    VBRIDGE | BULLBIT,
    VBRIDGE | BULLBIT,
    VBRIDGE | BULLBIT,
    RIVER
  ];
  var horizontalDeltaX = [-2, 2, -2, -1, 0, 1, 2];
  var horizontalDeltaY = [-1, -1, 0, 0, 0, 0, 0];
  var openHorizontal = [
    HBRDG1 | BULLBIT,
    HBRDG3 | BULLBIT,
    HBRDG0 | BULLBIT,
    RIVER,
    BRWH | BULLBIT,
    RIVER,
    HBRDG2 | BULLBIT
  ];
  var closeHorizontal = [
    RIVER,
    RIVER,
    HBRIDGE | BULLBIT,
    HBRIDGE | BULLBIT,
    HBRIDGE | BULLBIT,
    HBRIDGE | BULLBIT,
    HBRIDGE | BULLBIT
  ];
  var doBridge = function(map, x, y, currentTile, simData) {
    if (currentTile === BRWV) {
      if (Random.getChance(3) && simData.spriteManager.getBoatDistance(x, y) > 340)
        closeBridge(map, x, y, verticalDeltaX, verticalDeltaY, openVertical, closeVertical);
      return true;
    }
    if (currentTile == BRWH) {
      if (Random.getChance(3) && simData.spriteManager.getBoatDistance(x, y) > 340)
        closeBridge(map, x, y, horizontalDeltaX, horizontalDeltaY, openHorizontal, closeHorizontal);
      return true;
    }
    if (simData.spriteManager.getBoatDistance(x, y) < 300 || Random.getChance(7)) {
      if (currentTile & 1) {
        if (x < map.width - 1) {
          if (map.getTileValue(x + 1, y) === CHANNEL) {
            openBridge(map, x, y, verticalDeltaX, verticalDeltaY, closeVertical, openVertical);
            return true;
          }
        }
        return false;
      } else {
        if (y > 0) {
          if (map.getTileValue(x, y - 1) === CHANNEL) {
            openBridge(map, x, y, horizontalDeltaX, horizontalDeltaY, closeHorizontal, openHorizontal);
            return true;
          }
        }
      }
    }
    return false;
  };
  var densityTable = [ROADBASE, LTRFBASE, HTRFBASE];
  var roadFound = function(map, x, y, simData) {
    simData.census.roadTotal += 1;
    var currentTile = map.getTile(x, y);
    var tileValue = currentTile.getValue();
    if (simData.budget.shouldDegradeRoad()) {
      if (Random.getChance(511)) {
        currentTile = map.getTile(x, y);
        if (!currentTile.isConductive()) {
          if (simData.budget.roadEffect < (Random.getRandom16() & 31)) {
            var mapValue = currentTile.getValue();
            if ((tileValue & 15) < 2 || (tileValue & 15) === 15)
              map.setTile(x, y, RIVER, 0);
            else
              map.setTo(x, y, TileUtils.randomRubble());
            return;
          }
        }
      }
    }
    if (!currentTile.isCombustible()) {
      simData.census.roadTotal += 4;
      if (doBridge(map, x, y, tileValue, simData))
        return;
    }
    var density = 0;
    if (tileValue < LTRFBASE) {
      density = 0;
    } else if (tileValue < HTRFBASE) {
      density = 1;
    } else {
      simData.census.roadTotal += 1;
      density = 2;
    }
    var currentDensity = simData.blockMaps.trafficDensityMap.worldGet(x, y) >> 6;
    if (currentDensity > 1)
      currentDensity -= 1;
    if (currentDensity === density)
      return;
    var newValue = (tileValue - ROADBASE & 15) + densityTable[currentDensity];
    var newFlags = currentTile.getFlags() & ~ANIMBIT;
    if (currentDensity > 0)
      newFlags |= ANIMBIT;
    map.setTo(x, y, new Tile(newValue, newFlags));
  };
  var Road = {
    registerHandlers: function(mapScanner, repairManager) {
      mapScanner.addAction(TileUtils.isRoad, roadFound);
    }
  };

  // external/micropolisjs/src/baseSprite.js
  var init2 = function(type, map, spriteManager, x, y) {
    this.type = type;
    this.map = map;
    this.spriteManager = spriteManager;
    var pixX = x;
    var pixY = y;
    var worldX = x >> 4;
    var worldY = y >> 4;
    Object.defineProperty(
      this,
      "x",
      {
        configurable: false,
        enumerable: true,
        set: function(val) {
          pixX = val;
          worldX = val >> 4;
        },
        get: function() {
          return pixX;
        }
      }
    );
    Object.defineProperty(
      this,
      "y",
      {
        configurable: false,
        enumerable: true,
        set: function(val) {
          pixY = val;
          worldY = val >> 4;
        },
        get: function() {
          return pixY;
        }
      }
    );
    Object.defineProperty(
      this,
      "worldX",
      {
        configurable: false,
        enumerable: true,
        set: function(val) {
          worldX = val;
          pixX = val << 4;
        },
        get: function() {
          return worldX;
        }
      }
    );
    Object.defineProperty(
      this,
      "worldY",
      {
        configurable: false,
        enumerable: true,
        set: function(val) {
          worldY = val;
          pixY = val << 4;
        },
        get: function() {
          return worldY;
        }
      }
    );
    this.origX = 0;
    this.origY = 0;
    this.destX = 0;
    this.destY = 0;
    this.count = 0;
    this.soundCount = 0;
    this.dir = 0;
    this.newDir = 0;
    this.step = 0;
    this.flag = 0;
    this.turn = 0;
    this.accel = 0;
    this.speed = 100;
  };
  var getFileName = function() {
    return ["obj", this.type, "-", this.frame - 1].join("");
  };
  var spriteNotInBounds = function() {
    var x = this.worldX;
    var y = this.worldY;
    return x < 0 || y < 0 || x >= this.map.width || y >= this.map.height;
  };
  var base = {
    init: init2,
    getFileName,
    spriteNotInBounds
  };
  var BaseSprite = function(spriteConstructor) {
    spriteConstructor.prototype = Object.create(base);
    EventEmitter(spriteConstructor);
  };

  // external/micropolisjs/src/airplaneSprite.js
  function AirplaneSprite(map, spriteManager, x, y) {
    this.init(SPRITE_AIRPLANE, map, spriteManager, x, y);
    this.width = 48;
    this.height = 48;
    this.xOffset = -24;
    this.yOffset = -24;
    if (x > SpriteUtils.worldToPix(map.width - 20)) {
      this.destX = this.x - 200;
      this.frame = 7;
    } else {
      this.destX = this.x + 200;
      this.frame = 11;
    }
    this.destY = this.y;
  }
  BaseSprite(AirplaneSprite);
  var xDelta3 = [0, 0, 6, 8, 6, 0, -6, -8, -6, 8, 8, 8];
  var yDelta3 = [0, -8, -6, 0, 6, 8, 6, 0, -6, 0, 0, 0];
  AirplaneSprite.prototype.move = function(spriteCycle, disasterManager, blockMaps) {
    var frame = this.frame;
    if (spriteCycle % 5 === 0) {
      if (frame > 8) {
        frame--;
        if (frame < 9) {
          frame = 3;
        }
        this.frame = frame;
      } else {
        var d = SpriteUtils.getDir(this.x, this.y, this.destX, this.destY);
        frame = SpriteUtils.turnTo(frame, d);
        this.frame = frame;
      }
    }
    var absDist = SpriteUtils.absoluteDistance(this.x, this.y, this.destX, this.destY);
    if (absDist < 50) {
      this.destX = Random.getRandom(SpriteUtils.worldToPix(this.map.width)) + 8;
      this.destY = Random.getRandom(SpriteUtils.worldToPix(this.map.height)) + 8;
    }
    if (disasterManager.enableDisasters) {
      var explode = false;
      var spriteList = this.spriteManager.getSpriteList();
      for (var i = 0; i < spriteList.length; i++) {
        var s = spriteList[i];
        if (s.frame === 0 || s === this)
          continue;
        if ((s.type === SPRITE_HELICOPTER || s.type === SPRITE_AIRPLANE) && SpriteUtils.checkSpriteCollision(this, s)) {
          s.explodeSprite();
          explode = true;
        }
      }
      if (explode)
        this.explodeSprite();
    }
    this.x += xDelta3[frame];
    this.y += yDelta3[frame];
    if (this.spriteNotInBounds())
      this.frame = 0;
  };
  AirplaneSprite.prototype.explodeSprite = function() {
    this.frame = 0;
    this.spriteManager.makeExplosionAt(this.x, this.y);
    this._emitEvent(PLANE_CRASHED, { showable: true, x: this.worldX, y: this.worldY });
  };
  Object.defineProperties(
    AirplaneSprite,
    {
      ID: MiscUtils.makeConstantDescriptor(3),
      width: MiscUtils.makeConstantDescriptor(48),
      frames: MiscUtils.makeConstantDescriptor(11)
    }
  );

  // external/micropolisjs/src/boatSprite.js
  function BoatSprite(map, spriteManager, x, y) {
    this.init(SPRITE_SHIP, map, spriteManager, x, y);
    this.width = 48;
    this.height = 48;
    this.xOffset = -24;
    this.yOffset = -24;
    if (x < SpriteUtils.worldToPix(4))
      this.frame = 3;
    else if (x >= SpriteUtils.worldToPix(map.width - 4))
      this.frame = 7;
    else if (y < SpriteUtils.worldToPix(4))
      this.frame = 5;
    else if (y >= SpriteUtils.worldToPix(map.height - 4))
      this.frame = 1;
    else
      this.frame = 3;
    this.newDir = this.frame;
    this.dir = 10;
    this.count = 1;
  }
  BaseSprite(BoatSprite);
  var oppositeAndUnderwater = function(tileValue, oldDir, newDir) {
    var opposite = oldDir + 4;
    if (opposite > 8)
      opposite -= 8;
    if (newDir != opposite)
      return false;
    if (tileValue == POWERBASE || tileValue == POWERBASE + 1 || tileValue == RAILBASE || tileValue == RAILBASE + 1)
      return true;
    return false;
  };
  var tileDeltaX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
  var tileDeltaY = [0, -1, -1, 0, 1, 1, 1, 0, -1];
  var xDelta4 = [0, 0, 2, 2, 2, 0, -2, -2, -2];
  var yDelta4 = [0, -2, -2, 0, 2, 2, 2, 0, -2];
  var tileWhiteList = [
    RIVER,
    CHANNEL,
    POWERBASE,
    POWERBASE + 1,
    RAILBASE,
    RAILBASE + 1,
    BRWH,
    BRWV
  ];
  var CANTMOVE = 10;
  BoatSprite.prototype.move = function(spriteCycle, disasterManager, blockMaps) {
    var tile3 = RIVER;
    var frame, x, y;
    if (this.soundCount > 0)
      this.soundCount--;
    if (this.soundCount === 0) {
      if ((Random.getRandom16() & 3) === 1) {
        this._emitEvent(SOUND_HONKHONK);
      }
      this.soundCount = 200;
    }
    if (this.count > 0)
      this.count--;
    if (this.count === 0) {
      this.count = 9;
      if (this.frame !== this.newDir) {
        this.frame = SpriteUtils.turnTo(this.frame, this.newDir);
        return;
      }
      var startDir = Random.getRandom16() & 7;
      for (var dir = startDir; dir < startDir + 8; dir++) {
        frame = (dir & 7) + 1;
        if (frame === this.dir)
          continue;
        x = this.worldX + tileDeltaX[frame];
        y = this.worldY + tileDeltaY[frame];
        if (this.map.testBounds(x, y)) {
          tile3 = this.map.getTileValue(x, y);
          if (tile3 === CHANNEL || tile3 === BRWH || tile3 === BRWV || oppositeAndUnderwater(tile3, this.dir, frame)) {
            this.newDir = frame;
            this.frame = SpriteUtils.turnTo(this.frame, this.newDir);
            this.dir = frame + 4;
            if (this.dir > 8)
              this.dir -= 8;
            break;
          }
        }
      }
      if (dir === startDir + 8) {
        this.dir = CANTMOVE;
        this.newDir = (Random.getRandom16() & 7) + 1;
      }
    } else {
      frame = this.frame;
      if (frame === this.newDir) {
        this.x += xDelta4[frame];
        this.y += yDelta4[frame];
      }
    }
    if (this.spriteNotInBounds()) {
      this.frame = 0;
      return;
    }
    for (var i = 0; i < 8; i++) {
      if (tile3 === tileWhiteList[i]) {
        break;
      }
      if (i === 7) {
        this.explodeSprite();
        SpriteUtils.destroyMapTile(this.spriteManager, this.map, blockMaps, this.x, this.y);
      }
    }
  };
  BoatSprite.prototype.explodeSprite = function() {
    this.frame = 0;
    this.spriteManager.makeExplosionAt(this.x, this.y);
    this._emitEvent(SHIP_CRASHED, { showable: true, x: this.worldX, y: this.worldY });
  };
  Object.defineProperties(
    BoatSprite,
    {
      ID: MiscUtils.makeConstantDescriptor(4),
      width: MiscUtils.makeConstantDescriptor(48),
      frames: MiscUtils.makeConstantDescriptor(8)
    }
  );

  // external/micropolisjs/src/copterSprite.js
  function CopterSprite(map, spriteManager, x, y) {
    this.init(SPRITE_HELICOPTER, map, spriteManager, x, y);
    this.width = 32;
    this.height = 32;
    this.xOffset = -16;
    this.yOffset = -16;
    this.frame = 5;
    this.count = 1500;
    this.destX = Random.getRandom(SpriteUtils.worldToPix(map.width)) + 8;
    this.destY = Random.getRandom(SpriteUtils.worldToPix(map.height)) + 8;
    this.origX = x;
    this.origY = y;
  }
  BaseSprite(CopterSprite);
  var xDelta5 = [0, 0, 3, 5, 3, 0, -3, -5, -3];
  var yDelta5 = [0, -5, -3, 0, 3, 5, 3, 0, -3];
  CopterSprite.prototype.move = function(spriteCycle, disasterManager, blockMaps) {
    if (this.soundCount > 0)
      this.soundCount--;
    if (this.count > 0)
      this.count--;
    if (this.count === 0) {
      var s = this.spriteManager.getSprite(SPRITE_MONSTER);
      if (s !== null) {
        this.destX = s.x;
        this.destY = s.y;
      } else {
        s = this.spriteManager.getSprite(SPRITE_TORNADO);
        if (s !== null) {
          this.destX = s.x;
          this.destY = s.y;
        } else {
          this.destX = this.origX;
          this.destY = this.origY;
        }
      }
      var absDist = SpriteUtils.absoluteDistance(this.x, this.y, this.origX, this.origY);
      if (absDist < 30) {
        this.frame = 0;
        return;
      }
    }
    if (this.soundCount === 0) {
      var x = this.worldX;
      var y = this.worldY;
      if (x >= 0 && x < this.map.width && y >= 0 && y < this.map.height) {
        if (blockMaps.trafficDensityMap.worldGet(x, y) > 170 && (Random.getRandom16() & 7) === 0) {
          this._emitEvent(HEAVY_TRAFFIC, { x, y });
          this._emitEvent(SOUND_HEAVY_TRAFFIC);
          this.soundCount = 200;
        }
      }
    }
    var frame = this.frame;
    if ((spriteCycle & 3) === 0) {
      var dir = SpriteUtils.getDir(this.x, this.y, this.destX, this.destY);
      frame = SpriteUtils.turnTo(frame, dir);
      this.frame = frame;
    }
    this.x += xDelta5[frame];
    this.y += yDelta5[frame];
  };
  CopterSprite.prototype.explodeSprite = function() {
    this.frame = 0;
    this.spriteManager.makeExplosionAt(this.x, this.y);
    this._emitEvent(HELICOPTER_CRASHED, { x: this.worldX, y: this.worldY });
  };
  Object.defineProperties(
    CopterSprite,
    {
      ID: MiscUtils.makeConstantDescriptor(2),
      width: MiscUtils.makeConstantDescriptor(32),
      frames: MiscUtils.makeConstantDescriptor(8)
    }
  );

  // external/micropolisjs/src/explosionSprite.js
  function ExplosionSprite(map, spriteManager, x, y) {
    this.init(SPRITE_EXPLOSION, map, spriteManager, x, y);
    this.width = 48;
    this.height = 48;
    this.xOffset = -24;
    this.yOffset = -24;
    this.frame = 1;
  }
  BaseSprite(ExplosionSprite);
  ExplosionSprite.prototype.startFire = function(x, y) {
    x = this.worldX;
    y = this.worldY;
    if (!this.map.testBounds(x, y))
      return;
    var tile3 = this.map.getTile(x, y);
    var tileValue = tile3.getValue();
    if (!tile3.isCombustible() && tileValue !== DIRT)
      return;
    if (tile3.isZone())
      return;
    this.map.setTo(x, y, TileUtils.randomFire());
  };
  ExplosionSprite.prototype.move = function(spriteCycle, disasterManager, blockMaps) {
    if ((spriteCycle & 1) === 0) {
      if (this.frame === 1) {
        var explosionX = this.worldX;
        var explosionY = this.worldY;
        this._emitEvent(SOUND_EXPLOSIONHIGH);
        this._emitEvent(EXPLOSION_REPORTED, { x: explosionX, y: explosionY });
      }
      this.frame++;
    }
    if (this.frame > 6) {
      this.frame = 0;
      this.startFire(this.x, this.y);
      this.startFire(this.x - 16, this.y - 16);
      this.startFire(this.x + 16, this.y + 16);
      this.startFire(this.x - 16, this.y + 16);
      this.startFire(this.x + 16, this.y + 16);
    }
  };
  Object.defineProperties(
    ExplosionSprite,
    {
      ID: MiscUtils.makeConstantDescriptor(7),
      width: MiscUtils.makeConstantDescriptor(48),
      frames: MiscUtils.makeConstantDescriptor(6)
    }
  );

  // external/micropolisjs/src/monsterSprite.js
  function MonsterSprite(map, spriteManager, x, y) {
    this.init(SPRITE_MONSTER, map, spriteManager, x, y);
    this.width = 48;
    this.height = 48;
    this.xOffset = -24;
    this.yOffset = -24;
    if (x > SpriteUtils.worldToPix(map.width) / 2) {
      if (y > SpriteUtils.worldToPix(map.height) / 2)
        this.frame = 10;
      else
        this.frame = 7;
    } else if (y > SpriteUtils.worldToPix(map.height) / 2) {
      this.frame = 1;
    } else {
      this.frame = 4;
    }
    this.flag = 0;
    this.count = 1e3;
    this.destX = SpriteUtils.worldToPix(map.pollutionMaxX);
    this.destY = SpriteUtils.worldToPix(map.pollutionMaxY);
    this.origX = this.x;
    this.origY = this.y;
    this._seenLand = false;
  }
  BaseSprite(MonsterSprite);
  var xDelta6 = [2, 2, -2, -2, 0];
  var yDelta6 = [-2, 2, 2, -2, 0];
  var cardinals1 = [0, 1, 2, 3];
  var cardinals2 = [1, 2, 3, 0];
  var diagonals1 = [2, 5, 8, 11];
  var diagonals2 = [11, 2, 5, 8];
  MonsterSprite.prototype.move = function(spriteCycle, disasterManager, blockMaps) {
    if (this.soundCount > 0)
      this.soundCount--;
    var currentDir = Math.floor((this.frame - 1) / 3);
    var frame, dir;
    if (currentDir < 4) {
      frame = (this.frame - 1) % 3;
      if (frame === 2)
        this.step = 0;
      if (frame === 0)
        this.step = 1;
      if (this.step)
        frame++;
      else
        frame--;
      var absDist = SpriteUtils.absoluteDistance(this.x, this.y, this.destX, this.destY);
      if (absDist < 60) {
        if (this.flag === 0) {
          this.flag = 1;
          this.destX = this.origX;
          this.destY = this.origY;
        } else {
          this.frame = 0;
          this._emitEvent(SPRITE_DYING);
          return;
        }
      }
      dir = SpriteUtils.getDir(this.x, this.y, this.destX, this.destY);
      dir = Math.floor((dir - 1) / 2);
      if (dir !== currentDir && Random.getChance(10)) {
        if (Random.getRandom16() & 1)
          frame = cardinals1[currentDir];
        else
          frame = cardinals2[currentDir];
        currentDir = 4;
        if (!this.soundCount) {
          this._emitEvent(SOUND_MONSTER);
          this.soundCount = 50 + Random.getRandom(100);
        }
      }
    } else {
      currentDir = 4;
      dir = this.frame;
      frame = dir - 13 & 3;
      if (!(Random.getRandom16() & 3)) {
        if (Random.getRandom16() & 1)
          frame = diagonals1[frame];
        else
          frame = diagonals2[frame];
        currentDir = Math.floor((frame - 1) / 3);
        frame = (frame - 1) % 3;
      }
    }
    frame = currentDir * 3 + frame + 1;
    if (frame > 16)
      frame = 16;
    this.frame = frame;
    this.x += xDelta6[currentDir];
    this.y += yDelta6[currentDir];
    if (this.count > 0)
      this.count--;
    var tileValue = SpriteUtils.getTileValue(this.map, this.x, this.y);
    if (tileValue === -1 || tileValue === RIVER && this.count < 500)
      this.frame = 0;
    if (tileValue === DIRT || tileValue > WATER_HIGH)
      this._seenLand = true;
    var spriteList = this.spriteManager.getSpriteList();
    for (var i = 0; i < spriteList.length; i++) {
      var s = spriteList[i];
      if (s.frame !== 0 && (s.type === SPRITE_AIRPLANE || s.type === SPRITE_HELICOPTER || s.type === SPRITE_SHIP || s.type === SPRITE_TRAIN) && SpriteUtils.checkSpriteCollision(this, s))
        s.explodeSprite();
    }
    if (this.frame === 0)
      this._emitEvent(SPRITE_DYING);
    SpriteUtils.destroyMapTile(this.spriteManager, this.map, blockMaps, this.x, this.y);
    this._emitEvent(SPRITE_MOVED, { x: this.worldX, y: this.worldY });
  };
  Object.defineProperties(
    MonsterSprite,
    {
      ID: MiscUtils.makeConstantDescriptor(5),
      width: MiscUtils.makeConstantDescriptor(48),
      frames: MiscUtils.makeConstantDescriptor(16)
    }
  );

  // external/micropolisjs/src/tornadoSprite.js
  function TornadoSprite(map, spriteManager, x, y) {
    this.init(SPRITE_TORNADO, map, spriteManager, x, y);
    this.width = 48;
    this.height = 48;
    this.xOffset = -24;
    this.yOffset = -40;
    this.frame = 1;
    this.count = 200;
  }
  BaseSprite(TornadoSprite);
  var xDelta7 = [2, 3, 2, 0, -2, -3];
  var yDelta7 = [-2, 0, 2, 3, 2, 0];
  TornadoSprite.prototype.move = function(spriteCycle, disasterManager, blockMaps) {
    var frame = this.frame;
    if (frame === 2) {
      if (this.flag)
        frame = 3;
      else
        frame = 1;
    } else {
      if (frame === 1)
        this.flag = 1;
      else
        this.flag = 0;
      frame = 2;
    }
    if (this.count > 0)
      this.count--;
    this.frame = frame;
    var spriteList = this.spriteManager.getSpriteList();
    for (var i = 0; i < spriteList.length; i++) {
      var s = spriteList[i];
      if (s.frame !== 0 && (s.type === SPRITE_AIRPLANE || s.type === SPRITE_HELICOPTER || s.type === SPRITE_SHIP || s.type === SPRITE_TRAIN) && SpriteUtils.checkSpriteCollision(this, s)) {
        s.explodeSprite();
      }
    }
    frame = Random.getRandom(5);
    this.x += xDelta7[frame];
    this.y += yDelta7[frame];
    if (this.spriteNotInBounds())
      this.frame = 0;
    if (this.count !== 0 && Random.getRandom(500) === 0)
      this.frame = 0;
    if (this.frame === 0)
      this._emitEvent(SPRITE_DYING);
    SpriteUtils.destroyMapTile(this.spriteManager, this.map, blockMaps, this.x, this.y);
    this._emitEvent(SPRITE_MOVED, { x: this.worldX, y: this.worldY });
  };
  Object.defineProperties(
    TornadoSprite,
    {
      ID: MiscUtils.makeConstantDescriptor(6),
      width: MiscUtils.makeConstantDescriptor(48),
      frames: MiscUtils.makeConstantDescriptor(3)
    }
  );

  // external/micropolisjs/src/trainSprite.js
  function TrainSprite(map, spriteManager, x, y) {
    this.init(
      SPRITE_TRAIN,
      map,
      spriteManager,
      x,
      y
    );
    this.width = 32;
    this.height = 32;
    this.xOffset = -16;
    this.yOffset = -16;
    this.frame = 1;
    this.dir = 4;
  }
  BaseSprite(TrainSprite);
  var tileDeltaX2 = [0, 16, 0, -16];
  var tileDeltaY2 = [-16, 0, 16, 0];
  var xDelta8 = [0, 4, 0, -4, 0];
  var yDelta8 = [-4, 0, 4, 0, 0];
  var TrainPic2 = [1, 2, 1, 2, 5];
  var NWSE = 3;
  var NESW = 4;
  var UNDERWATER = 5;
  var WEST2 = 3;
  var CANTMOVE2 = 4;
  TrainSprite.prototype.move = function(spriteCycle, disasterManager, blockMaps) {
    if (this.frame === NWSE || this.frame === NESW)
      this.frame = TrainPic2[this.dir];
    this.x += xDelta8[this.dir];
    this.y += yDelta8[this.dir];
    if ((spriteCycle & 3) === 0) {
      var dir = Random.getRandom16() & 3;
      for (var i = dir; i < dir + 4; i++) {
        var dir2 = i & 3;
        if (this.dir !== CANTMOVE2) {
          if (dir2 === (this.dir + 2 & 3))
            continue;
        }
        var tileValue = SpriteUtils.getTileValue(this.map, this.x + tileDeltaX2[dir2], this.y + tileDeltaY2[dir2]);
        if (tileValue >= RAILBASE && tileValue <= LASTRAIL || tileValue === RAILVPOWERH || tileValue === RAILHPOWERV) {
          if (this.dir !== dir2 && this.dir !== CANTMOVE2) {
            if (this.dir + dir2 === WEST2)
              this.frame = NWSE;
            else
              this.frame = NESW;
          } else {
            this.frame = TrainPic2[dir2];
          }
          if (tileValue === HRAIL || tileValue === VRAIL)
            this.frame = UNDERWATER;
          this.dir = dir2;
          return;
        }
      }
      if (this.dir === CANTMOVE2) {
        this.frame = 0;
        return;
      }
      this.dir = CANTMOVE2;
    }
  };
  TrainSprite.prototype.explodeSprite = function() {
    this.frame = 0;
    this.spriteManager.makeExplosionAt(this.x, this.y);
    this._emitEvent(TRAIN_CRASHED, { showable: true, x: this.worldX, y: this.worldY });
  };
  Object.defineProperties(
    TrainSprite,
    {
      ID: MiscUtils.makeConstantDescriptor(1),
      width: MiscUtils.makeConstantDescriptor(32),
      frames: MiscUtils.makeConstantDescriptor(5)
    }
  );

  // external/micropolisjs/src/spriteManager.js
  var SpriteManager = EventEmitter(function(map) {
    this.spriteList = [];
    this.map = map;
    this.spriteCycle = 0;
  });
  SpriteManager.prototype.getSprite = function(type) {
    var filteredList = this.spriteList.filter(function(s) {
      return s.frame !== 0 && s.type === type;
    });
    if (filteredList.length === 0)
      return null;
    return filteredList[0];
  };
  SpriteManager.prototype.getSpriteList = function() {
    return this.spriteList.slice();
  };
  SpriteManager.prototype.getSpritesInView = function(startX, startY, pixelWidth, pixelHeight) {
    var sprites = [];
    startX = SpriteUtils.worldToPix(startX);
    startY = SpriteUtils.worldToPix(startY);
    var lastX = startX + pixelWidth;
    var lastY = startY + pixelHeight;
    return this.spriteList.filter(function(s) {
      var spriteLeft = s.x + s.xOffset;
      var spriteTop = s.y + s.yOffset;
      var spriteRight = s.x + s.xOffset + s.width;
      var spriteBottom = s.y + s.yOffset + s.width;
      var leftInBounds = spriteLeft >= startX && spriteLeft < lastX;
      var rightInBounds = spriteRight >= startX && spriteRight < lastX;
      var topInBounds = spriteTop >= startY && spriteTop < lastY;
      var bottomInBounds = spriteBottom >= startY && spriteBottom < lastY;
      return (leftInBounds || rightInBounds) && (topInBounds || bottomInBounds);
    });
  };
  SpriteManager.prototype.moveObjects = function(simData) {
    var disasterManager = simData.disasterManager;
    var blockMaps = simData.blockMaps;
    this.spriteCycle += 1;
    var list = this.spriteList.slice();
    for (var i = 0, l = list.length; i < l; i++) {
      var sprite = list[i];
      if (sprite.frame === 0)
        continue;
      sprite.move(this.spriteCycle, disasterManager, blockMaps);
    }
    this.pruneDeadSprites();
  };
  SpriteManager.prototype.makeSprite = function(type, x, y) {
    var newSprite = new constructors[type](this.map, this, x, y);
    for (var i = 0, l = CRASHES.length; i < l; i++)
      newSprite.addEventListener(CRASHES[i], MiscUtils.reflectEvent.bind(this, CRASHES[i]));
    if (type == SPRITE_HELICOPTER)
      newSprite.addEventListener(HEAVY_TRAFFIC, MiscUtils.reflectEvent.bind(this, HEAVY_TRAFFIC));
    var soundCues = [
      SOUND_EXPLOSIONHIGH,
      SOUND_EXPLOSIONLOW,
      SOUND_HONKHONK,
      SOUND_MONSTER,
      SOUND_HEAVY_TRAFFIC
    ];
    for (var s = 0, sl = soundCues.length; s < sl; s++)
      newSprite.addEventListener(soundCues[s], MiscUtils.reflectEvent.bind(this, soundCues[s]));
    this.spriteList.push(newSprite);
    return newSprite;
  };
  SpriteManager.prototype.makeTornado = function() {
    var sprite = this.getSprite(SPRITE_TORNADO);
    if (sprite !== null) {
      sprite.count = 200;
      this._emitEvent(TORNADO_SIGHTED, { trackable: true, x: sprite.worldX, y: sprite.worldY, sprite });
      return;
    }
    var x = Random.getRandom(SpriteUtils.worldToPix(this.map.width) - 800) + 400;
    var y = Random.getRandom(SpriteUtils.worldToPix(this.map.height) - 200) + 100;
    sprite = this.makeSprite(SPRITE_TORNADO, x, y);
    this._emitEvent(TORNADO_SIGHTED, { trackable: true, x: sprite.worldX, y: sprite.worldY, sprite });
  };
  SpriteManager.prototype.makeExplosion = function(x, y) {
    if (this.map.testBounds(x, y))
      this.makeExplosionAt(SpriteUtils.worldToPix(x), SpriteUtils.worldToPix(y));
  };
  SpriteManager.prototype.makeExplosionAt = function(x, y) {
    this.makeSprite(SPRITE_EXPLOSION, x, y);
  };
  SpriteManager.prototype.generatePlane = function(x, y) {
    if (this.getSprite(SPRITE_AIRPLANE) !== null)
      return;
    this.makeSprite(
      SPRITE_AIRPLANE,
      SpriteUtils.worldToPix(x),
      SpriteUtils.worldToPix(y)
    );
  };
  SpriteManager.prototype.generateTrain = function(census, x, y) {
    if (census.totalPop > 10 && this.getSprite(SPRITE_TRAIN) === null && Random.getRandom(25) === 0)
      this.makeSprite(
        SPRITE_TRAIN,
        SpriteUtils.worldToPix(x) + 8,
        SpriteUtils.worldToPix(y) + 8
      );
  };
  SpriteManager.prototype.generateShip = function() {
    var x, y;
    if (Random.getChance(3)) {
      for (x = 4; x < this.map.width - 2; x++) {
        if (this.map.getTileValue(x, 0) === CHANNEL) {
          this.makeShipHere(x, 0);
          return;
        }
      }
    }
    if (Random.getChance(3)) {
      for (y = 1; y < this.map.height - 2; y++) {
        if (this.map.getTileValue(0, y) === CHANNEL) {
          this.makeShipHere(0, y);
          return;
        }
      }
    }
    if (Random.getChance(3)) {
      for (x = 4; x < this.map.width - 2; x++) {
        if (this.map.getTileValue(x, this.map.height - 1) === CHANNEL) {
          this.makeShipHere(x, this.map.height - 1);
          return;
        }
      }
    }
    if (Random.getChance(3)) {
      for (y = 1; y < this.map.height - 2; y++) {
        if (this.map.getTileValue(this.map.width - 1, y) === CHANNEL) {
          this.makeShipHere(this.map.width - 1, y);
          return;
        }
      }
    }
  };
  SpriteManager.prototype.getBoatDistance = function(x, y) {
    var dist = 99999;
    var pixelX = SpriteUtils.worldToPix(x) + 8;
    var pixelY = SpriteUtils.worldToPix(y) + 8;
    for (var i = 0, l = this.spriteList.length; i < l; i++) {
      var sprite = this.spriteList[i];
      if (sprite.type === SPRITE_SHIP && sprite.frame !== 0) {
        var sprDist = Math.abs(sprite.x - pixelX) + Math.abs(sprite.y - pixelY);
        dist = Math.min(dist, sprDist);
      }
    }
    return dist;
  };
  SpriteManager.prototype.makeShipHere = function(x, y) {
    this.makeSprite(
      SPRITE_SHIP,
      SpriteUtils.worldToPix(x),
      SpriteUtils.worldToPix(y)
    );
  };
  SpriteManager.prototype.generateCopter = function(x, y) {
    if (this.getSprite(SPRITE_HELICOPTER) !== null)
      return;
    this.makeSprite(
      SPRITE_HELICOPTER,
      SpriteUtils.worldToPix(x),
      SpriteUtils.worldToPix(y)
    );
  };
  SpriteManager.prototype.makeMonsterAt = function(x, y) {
    var sprite = this.makeSprite(
      SPRITE_MONSTER,
      SpriteUtils.worldToPix(x),
      SpriteUtils.worldToPix(y)
    );
    this._emitEvent(MONSTER_SIGHTED, { trackable: true, x, y, sprite });
  };
  SpriteManager.prototype.makeMonster = function() {
    var sprite = this.getSprite(SPRITE_MONSTER);
    if (sprite !== null) {
      sprite.soundCount = 1;
      sprite.count = 1e3;
      sprite.destX = SpriteUtils.worldToPix(this.map.pollutionMaxX);
      sprite.destY = SpriteUtils.worldToPix(this.map.pollutionMaxY);
    }
    var done = 0;
    for (var i = 0; i < 300; i++) {
      var x = Random.getRandom(this.map.width - 20) + 10;
      var y = Random.getRandom(this.map.height - 10) + 5;
      var tile3 = this.map.getTile(x, y);
      if (tile3.getValue() === RIVER) {
        this.makeMonsterAt(x, y);
        done = 1;
        break;
      }
    }
    if (done === 0)
      this.makeMonsterAt(60, 50);
  };
  SpriteManager.prototype.pruneDeadSprites = function(type) {
    this.spriteList = this.spriteList.filter(function(s) {
      return s.frame !== 0;
    });
  };
  var constructors = {};
  constructors[SPRITE_TRAIN] = TrainSprite;
  constructors[SPRITE_SHIP] = BoatSprite;
  constructors[SPRITE_MONSTER] = MonsterSprite;
  constructors[SPRITE_HELICOPTER] = CopterSprite;
  constructors[SPRITE_AIRPLANE] = AirplaneSprite;
  constructors[SPRITE_TORNADO] = TornadoSprite;
  constructors[SPRITE_EXPLOSION] = ExplosionSprite;

  // external/micropolisjs/src/stadia.js
  var emptyStadiumFound = function(map, x, y, simData) {
    simData.census.stadiumPop += 1;
    if (map.getTile(x, y).isPowered()) {
      if ((simData.cityTime + x + y & 31) === 0) {
        map.putZone(x, y, FULLSTADIUM, 4);
        map.addTileFlags(x, y, POWERBIT);
        map.setTile(x + 1, y, FOOTBALLGAME1, ANIMBIT);
        map.setTile(x + 1, y + 1, FOOTBALLGAME2, ANIMBIT);
      }
    }
  };
  var fullStadiumFound = function(map, x, y, simData) {
    simData.census.stadiumPop += 1;
    var isPowered = map.getTile(x, y).isPowered();
    if ((simData.cityTime + x + y & 7) === 0) {
      map.putZone(x, y, STADIUM, 4);
      if (isPowered)
        map.addTileFlags(x, y, POWERBIT);
    }
  };
  var Stadia = {
    registerHandlers: function(mapScanner, repairManager) {
      mapScanner.addAction(STADIUM, emptyStadiumFound);
      mapScanner.addAction(FULLSTADIUM, fullStadiumFound);
      repairManager.addAction(STADIUM, 15, 4);
    }
  };

  // external/micropolisjs/src/transport.js
  var railFound = function(map, x, y, simData) {
    simData.census.railTotal += 1;
    simData.spriteManager.generateTrain(simData.census, x, y);
    if (simData.budget.shouldDegradeRoad()) {
      if (Random.getChance(511)) {
        var currentTile = map.getTile(x, y);
        if (currentTile.isConductive())
          return;
        if (simData.budget.roadEffect < (Random.getRandom16() & 31)) {
          var mapValue = currentTile.getValue();
          if (mapValue < RAILBASE + 2)
            map.setTile(x, y, RIVER, 0);
          else
            map.setTo(x, y, TileUtils.randomRubble());
        }
      }
    }
  };
  var airportFound = function(map, x, y, simData) {
    simData.census.airportPop += 1;
    var tile3 = map.getTile(x, y);
    if (tile3.isPowered()) {
      if (map.getTileValue(x + 1, y - 1) === RADAR)
        map.setTile(x + 1, y - 1, RADAR0, CONDBIT | ANIMBIT | BURNBIT);
      if (Random.getRandom(5) === 0) {
        simData.spriteManager.generatePlane(x, y);
        return;
      }
      if (Random.getRandom(12) === 0)
        simData.spriteManager.generateCopter(x, y);
    } else {
      map.setTile(x + 1, y - 1, RADAR, CONDBIT | BURNBIT);
    }
  };
  var portFound = function(map, x, y, simData) {
    simData.census.seaportPop += 1;
    var tile3 = map.getTile(x, y);
    if (tile3.isPowered() && simData.spriteManager.getSprite(SPRITE_SHIP) === null)
      simData.spriteManager.generateShip();
  };
  var Transport = {
    registerHandlers: function(mapScanner, repairManager) {
      mapScanner.addAction(TileUtils.isRail, railFound);
      mapScanner.addAction(PORT, portFound);
      mapScanner.addAction(AIRPORT, airportFound);
      repairManager.addAction(PORT, 15, 4);
      repairManager.addAction(AIRPORT, 7, 6);
    }
  };

  // external/micropolisjs/src/valves.js
  var Valves = EventEmitter(function() {
    this.resValve = 0;
    this.comValve = 0;
    this.indValve = 0;
    this.resCap = false;
    this.comCap = false;
    this.indCap = false;
  });
  var RES_VALVE_RANGE = 2e3;
  var COM_VALVE_RANGE = 1500;
  var IND_VALVE_RANGE = 1500;
  var taxTable = [
    200,
    150,
    120,
    100,
    80,
    50,
    30,
    0,
    -10,
    -40,
    -100,
    -150,
    -200,
    -250,
    -300,
    -350,
    -400,
    -450,
    -500,
    -550,
    -600
  ];
  var extMarketParamTable = [1.2, 1.1, 0.98];
  Valves.prototype.save = function(saveData) {
    saveData.resValve = this.resValve;
    saveData.comValve = this.comValve;
    saveData.indValve = this.indValve;
  };
  Valves.prototype.load = function(saveData) {
    this.resValve = saveData.resValve;
    this.comValve = saveData.comValve;
    this.indValve = saveData.indValve;
    this._emitEvent(VALVES_UPDATED);
  };
  Valves.prototype.setValves = function(gameLevel, census, budget) {
    var resPopDenom = 8;
    var birthRate = 0.02;
    var labourBaseMax = 1.3;
    var internalMarketDenom = 3.7;
    var projectedIndPopMin = 5;
    var resRatioDefault = 1.3;
    var resRatioMax = 2;
    var comRatioMax = 2;
    var indRatioMax = 2;
    var taxMax = 20;
    var taxTableScale = 600;
    var employment, labourBase;
    var normalizedResPop = census.resPop / resPopDenom;
    census.totalPop = Math.round(normalizedResPop + census.comPop + census.indPop);
    if (census.resPop > 0)
      employment = (census.comHist10[1] + census.indHist10[1]) / normalizedResPop;
    else
      employment = 1;
    var migration = normalizedResPop * (employment - 1);
    var births = normalizedResPop * birthRate;
    var projectedResPop = normalizedResPop + migration + births;
    labourBase = census.comHist10[1] + census.indHist10[1];
    if (labourBase > 0)
      labourBase = census.resHist10[1] / labourBase;
    else
      labourBase = 1;
    labourBase = MiscUtils.clamp(labourBase, 0, labourBaseMax);
    var internalMarket = (normalizedResPop + census.comPop + census.indPop) / internalMarketDenom;
    var projectedComPop = internalMarket * labourBase;
    var projectedIndPop = census.indPop * labourBase * extMarketParamTable[gameLevel];
    projectedIndPop = Math.max(projectedIndPop, projectedIndPopMin);
    var resRatio;
    if (normalizedResPop > 0)
      resRatio = projectedResPop / normalizedResPop;
    else
      resRatio = resRatioDefault;
    var comRatio;
    if (census.comPop > 0)
      comRatio = projectedComPop / census.comPop;
    else
      comRatio = projectedComPop;
    var indRatio;
    if (census.indPop > 0)
      indRatio = projectedIndPop / census.indPop;
    else
      indRatio = projectedIndPop;
    resRatio = Math.min(resRatio, resRatioMax);
    comRatio = Math.min(comRatio, comRatioMax);
    indRatio = Math.min(indRatio, indRatioMax);
    var z = Math.min(budget.cityTax + gameLevel, taxMax);
    resRatio = (resRatio - 1) * taxTableScale + taxTable[z];
    comRatio = (comRatio - 1) * taxTableScale + taxTable[z];
    indRatio = (indRatio - 1) * taxTableScale + taxTable[z];
    this.resValve = MiscUtils.clamp(this.resValve + Math.round(resRatio), -RES_VALVE_RANGE, RES_VALVE_RANGE);
    this.comValve = MiscUtils.clamp(this.comValve + Math.round(comRatio), -COM_VALVE_RANGE, COM_VALVE_RANGE);
    this.indValve = MiscUtils.clamp(this.indValve + Math.round(indRatio), -IND_VALVE_RANGE, IND_VALVE_RANGE);
    if (this.resCap && this.resValve > 0)
      this.resValve = 0;
    if (this.comCap && this.comValve > 0)
      this.comValve = 0;
    if (this.indCap && this.indValve > 0)
      this.indValve = 0;
    this._emitEvent(VALVES_UPDATED);
  };

  // external/micropolisjs/src/simulation.js
  var Simulation = EventEmitter(function(gameMap, gameLevel, speed, savedGame) {
    this._map = gameMap;
    this.setLevel(gameLevel);
    this.setSpeed(speed);
    this._phaseCycle = 0;
    this._simCycle = 0;
    this._cityTime = 0;
    this._cityPopLast = 0;
    this._messageLast = void 0;
    this._startingYear = 1900;
    this._cityYearLast = -1;
    this._cityMonthLast = -1;
    this._lastPowerMessage = null;
    this.evaluation = new Evaluation(this._gameLevel);
    this._valves = new Valves();
    this.budget = new Budget();
    this._census = new Census();
    this._powerManager = new PowerManager(this._map);
    this.spriteManager = new SpriteManager(this._map);
    this._mapScanner = new MapScanner(this._map);
    this._repairManager = new RepairManager(this._map);
    this._traffic = new Traffic(this._map, this.spriteManager);
    this.disasterManager = new DisasterManager(this._map, this.spriteManager, this._gameLevel);
    this.blockMaps = {
      // Holds a "distance score" for the block from the city centre, range  -64 to 64
      cityCentreDistScoreMap: new BlockMap(this._map.width, this._map.height, 8),
      // Holds a score representing how dangerous an area is, in range 0-250 (larger is worse)
      crimeRateMap: new BlockMap(this._map.width, this._map.height, 2),
      // A map used to note positions of fire stations during the map scan, range 0-1000
      fireStationMap: new BlockMap(this._map.width, this._map.height, 8),
      // Holds a value containing a score representing the effect of fire cover in this neighborhood, range 0-1000
      fireStationEffectMap: new BlockMap(this._map.width, this._map.height, 8),
      // Holds scores representing the land value in the range 0-250
      landValueMap: new BlockMap(this._map.width, this._map.height, 2),
      // A map used to note positions of police stations during the map scan, range 0-1000
      policeStationMap: new BlockMap(this._map.width, this._map.height, 8),
      // Holds a value containing a score representing how much crime is dampened in this block, range 0-1000
      policeStationEffectMap: new BlockMap(this._map.width, this._map.height, 8),
      // Holds a value representing the amount of pollution in a neighbourhood, in the range 0-255
      pollutionDensityMap: new BlockMap(this._map.width, this._map.height, 2),
      // Holds a value representing population density of a block, in the range 0-510
      populationDensityMap: new BlockMap(this._map.width, this._map.height, 2),
      // Holds a value representing the rate of growth of a neighbourhood in the range -200 to +200
      rateOfGrowthMap: new BlockMap(this._map.width, this._map.height, 8),
      // Scores a block on how undeveloped/unspoilt it is, range 0-240
      terrainDensityMap: new BlockMap(this._map.width, this._map.height, 4),
      // Scores the volume of traffic in this cluster, range 0-240
      trafficDensityMap: new BlockMap(this._map.width, this._map.height, 2),
      // Temporary maps
      tempMap1: new BlockMap(this._map.width, this._map.height, 2),
      tempMap2: new BlockMap(this._map.width, this._map.height, 2),
      tempMap3: new BlockMap(this._map.width, this._map.height, 4)
    };
    this._clearCensus();
    if (savedGame) {
      this.load(savedGame);
    } else {
      this.budget.setFunds(2e4);
      this._census.totalPop = 1;
    }
    this.init();
  });
  Simulation.prototype.setLevel = function(l) {
    if (l !== Simulation.LEVEL_EASY && l !== Simulation.LEVEL_MED && l !== Simulation.LEVEL_HARD)
      throw new Error("Invalid level!");
    this._gameLevel = l;
  };
  Simulation.prototype.setSpeed = function(s) {
    if (s !== Simulation.SPEED_PAUSED && s !== Simulation.SPEED_SLOW && s !== Simulation.SPEED_MED && s !== Simulation.SPEED_FAST)
      throw new Error("Invalid speed!");
    this._speed = s;
  };
  Simulation.prototype.isPaused = function() {
    return this._speed === Simulation.SPEED_PAUSED;
  };
  var saveProps5 = ["_cityTime", "_speed", "_gameLevel"];
  Simulation.prototype.save = function(saveData) {
    for (var i = 0, l = saveProps5.length; i < l; i++)
      saveData[saveProps5[i]] = this[saveProps5[i]];
    this._map.save(saveData);
    this.evaluation.save(saveData);
    this._valves.save(saveData);
    this.budget.save(saveData);
    this._census.save(saveData);
  };
  Simulation.prototype.load = function(saveData) {
    for (var i = 0, l = saveProps5.length; i < l; i++)
      this[saveProps5[i]] = saveData[saveProps5[i]];
    this._map.load(saveData);
    this.evaluation.load(saveData);
    this._valves.load(saveData);
    this.budget.load(saveData);
    this._census.load(saveData);
  };
  Simulation.prototype.simTick = function() {
    this._simFrame();
    this._updateTime();
  };
  Simulation.prototype._simFrame = function() {
    if (this.budget.awaitingValues)
      return;
    var threshold = 100;
    switch (this._speed) {
      case Simulation.SPEED_PAUSED:
        return;
      case Simulation.SPEED_SLOW:
        break;
      case Simulation.SPEED_MED:
        threshold = 50;
        break;
      case Simulation.SPEED_FAST:
        threshold = 10;
        break;
      default:
        console.warn("Unexpected speed (" + this._speed + "): defaulting to slow");
    }
    var d = /* @__PURE__ */ new Date();
    if (d - this._lastTickTime < threshold)
      return;
    var simData = this._constructSimData();
    this._simulate(simData);
    this._lastTickTime = /* @__PURE__ */ new Date();
  };
  Simulation.prototype._clearCensus = function() {
    this._census.clearCensus();
    this._powerManager.clearPowerStack();
    this.blockMaps.fireStationMap.clear();
    this.blockMaps.policeStationMap.clear();
  };
  Simulation.prototype._constructSimData = function() {
    return {
      blockMaps: this.blockMaps,
      budget: this.budget,
      census: this._census,
      cityTime: this._cityTime,
      disasterManager: this.disasterManager,
      gameLevel: this._gameLevel,
      repairManager: this._repairManager,
      powerManager: this._powerManager,
      simulator: this,
      spriteManager: this.spriteManager,
      trafficManager: this._traffic,
      valves: this._valves
    };
  };
  Simulation.prototype.init = function() {
    this._lastTickTime = -1;
    var evaluationEvents = ["CLASSIFICATION_UPDATED", "POPULATION_UPDATED", "SCORE_UPDATED"].map(function(m) {
      return messages_exports[m];
    });
    for (var i = 0, l = evaluationEvents.length; i < l; i++)
      this.evaluation.addEventListener(evaluationEvents[i], MiscUtils.reflectEvent.bind(this, evaluationEvents[i]));
    this._powerManager.addEventListener(NOT_ENOUGH_POWER, (function(e2) {
      var d = /* @__PURE__ */ new Date();
      if (this._lastPowerMessage === null || d - this._lastPowerMessage > 1e3 * 60 * 2) {
        this._emitEvent(FRONT_END_MESSAGE, { subject: NOT_ENOUGH_POWER });
        this._lastPowerMessage = d;
      }
    }).bind(this));
    this.budget.addEventListener(FUNDS_CHANGED, MiscUtils.reflectEvent.bind(this, FUNDS_CHANGED));
    this.budget.addEventListener(BUDGET_NEEDED, MiscUtils.reflectEvent.bind(this, BUDGET_NEEDED));
    this.budget.addEventListener(NO_MONEY, this._wrapMessage.bind(this, NO_MONEY));
    this._valves.addEventListener(VALVES_UPDATED, this._onValveChange.bind(this));
    for (i = 0, l = DISASTER_MESSAGES.length; i < l; i++) {
      this.spriteManager.addEventListener(DISASTER_MESSAGES[i], this._wrapMessage.bind(this, DISASTER_MESSAGES[i]));
      this.disasterManager.addEventListener(DISASTER_MESSAGES[i], this._wrapMessage.bind(this, DISASTER_MESSAGES[i]));
    }
    for (i = 0, l = CRASHES.length; i < l; i++)
      this.spriteManager.addEventListener(CRASHES[i], this._wrapMessage.bind(this, CRASHES[i]));
    this.spriteManager.addEventListener(HEAVY_TRAFFIC, this._wrapMessage.bind(this, HEAVY_TRAFFIC));
    Commercial.registerHandlers(this._mapScanner, this._repairManager);
    EmergencyServices.registerHandlers(this._mapScanner, this._repairManager);
    Industrial.registerHandlers(this._mapScanner, this._repairManager);
    MiscTiles.registerHandlers(this._mapScanner, this._repairManager);
    this._powerManager.registerHandlers(this._mapScanner, this._repairManager);
    Road.registerHandlers(this._mapScanner, this._repairManager);
    Residential.registerHandlers(this._mapScanner, this._repairManager);
    Stadia.registerHandlers(this._mapScanner, this._repairManager);
    Transport.registerHandlers(this._mapScanner, this._repairManager);
    var simData = this._constructSimData();
    this._mapScanner.mapScan(0, this._map.width, simData);
    this._powerManager.doPowerScan(this._census);
    BlockMapUtils.pollutionTerrainLandValueScan(this._map, this._census, this.blockMaps);
    BlockMapUtils.crimeScan(this._census, this.blockMaps);
    BlockMapUtils.populationDensityScan(this._map, this.blockMaps);
    BlockMapUtils.fireAnalysis(this.blockMaps);
  };
  var speedPowerScan = [2, 4, 5];
  var speedPollutionTerrainLandValueScan = [2, 7, 17];
  var speedCrimeScan = [1, 8, 18];
  var speedPopulationDensityScan = [1, 9, 19];
  var speedFireAnalysis = [1, 10, 20];
  var CENSUS_FREQUENCY_10 = 4;
  var CENSUS_FREQUENCY_120 = CENSUS_FREQUENCY_10 * 10;
  var TAX_FREQUENCY = 48;
  var simulate = function(simData) {
    this._phaseCycle &= 15;
    var speedIndex = this._speed - 1;
    switch (this._phaseCycle) {
      case 0:
        if (++this._simCycle > 1023)
          this._simCycle = 0;
        this._cityTime++;
        if ((this._simCycle & 1) === 0)
          this._valves.setValves(this._gameLevel, this._census, this.budget);
        this._clearCensus();
        break;
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
        this._mapScanner.mapScan(
          (this._phaseCycle - 1) * this._map.width / 8,
          this._phaseCycle * this._map.width / 8,
          simData
        );
        break;
      case 9:
        if (this._cityTime % CENSUS_FREQUENCY_10 === 0)
          this._census.take10Census(this.budget);
        if (this._cityTime % CENSUS_FREQUENCY_120 === 0)
          this._census.take120Census(this.budget);
        if (this._cityTime % TAX_FREQUENCY === 0) {
          this.budget.collectTax(this._gameLevel, this._census);
          this.evaluation.cityEvaluation(simData);
        }
        break;
      case 10:
        if (this._simCycle % 5 === 0)
          BlockMapUtils.neutraliseRateOfGrowthMap(simData.blockMaps);
        BlockMapUtils.neutraliseTrafficMap(this.blockMaps);
        this._sendMessages();
        break;
      case 11:
        if (this._simCycle % speedPowerScan[speedIndex] === 0)
          this._powerManager.doPowerScan(this._census);
        break;
      case 12:
        if (this._simCycle % speedPollutionTerrainLandValueScan[speedIndex] === 0)
          BlockMapUtils.pollutionTerrainLandValueScan(this._map, this._census, this.blockMaps);
        break;
      case 13:
        if (this._simCycle % speedCrimeScan[speedIndex] === 0)
          BlockMapUtils.crimeScan(this._census, this.blockMaps);
        break;
      case 14:
        if (this._simCycle % speedPopulationDensityScan[speedIndex] === 0)
          BlockMapUtils.populationDensityScan(this._map, this.blockMaps);
        break;
      case 15:
        if (this._simCycle % speedFireAnalysis[speedIndex] === 0)
          BlockMapUtils.fireAnalysis(this.blockMaps);
        this.disasterManager.doDisasters(this._census);
        break;
    }
    this._phaseCycle = this._phaseCycle + 1 & 15;
  };
  Simulation.prototype._simulate = function(simData) {
    this.evaluation.cityEvaluation(simData);
    this._simulate = simulate;
    this._simulate(simData);
  };
  Simulation.prototype._wrapMessage = function(message, data) {
    this._emitEvent(FRONT_END_MESSAGE, { subject: message, data });
  };
  Simulation.prototype._sendMessages = function() {
    this._checkGrowth();
    var totalZonePop = this._census.resZonePop + this._census.comZonePop + this._census.indZonePop;
    var powerPop = this._census.nuclearPowerPop + this._census.coalPowerPop;
    switch (this._cityTime & 63) {
      case 1:
        if (Math.floor(totalZonePop / 4) >= this._census.resZonePop)
          this._emitEvent(FRONT_END_MESSAGE, { subject: NEED_MORE_RESIDENTIAL });
        break;
      case 5:
        if (Math.floor(totalZonePop / 8) >= this._census.comZonePop)
          this._emitEvent(FRONT_END_MESSAGE, { subject: NEED_MORE_COMMERCIAL });
        break;
      case 10:
        if (Math.floor(totalZonePop / 8) >= this._census.indZonePop)
          this._emitEvent(FRONT_END_MESSAGE, { subject: NEED_MORE_INDUSTRIAL });
        break;
      case 14:
        if (totalZonePop > 10 && totalZonePop * 2 > this._census.roadTotal)
          this._emitEvent(FRONT_END_MESSAGE, { subject: NEED_MORE_ROADS });
        break;
      case 18:
        if (totalZonePop > 50 && totalZonePop > this._census.railTotal)
          this._emitEvent(FRONT_END_MESSAGE, { subject: NEED_MORE_RAILS });
        break;
      case 22:
        if (totalZonePop > 10 && powerPop === 0)
          this._emitEvent(FRONT_END_MESSAGE, { subject: NEED_ELECTRICITY });
        break;
      case 26:
        if (this._census.resPop > 500 && this._census.stadiumPop === 0) {
          this._emitEvent(FRONT_END_MESSAGE, { subject: NEED_STADIUM });
          this._valves.resCap = true;
        } else {
          this._valves.resCap = false;
        }
        break;
      case 28:
        if (this._census.indPop > 70 && this._census.seaportPop === 0) {
          this._emitEvent(FRONT_END_MESSAGE, { subject: NEED_SEAPORT });
          this._valves.indCap = true;
        } else {
          this._valves.indCap = false;
        }
        break;
      case 30:
        if (this._census.comPop > 100 && this._census.airportPop === 0) {
          this._emitEvent(FRONT_END_MESSAGE, { subject: NEED_AIRPORT });
          this._valves.comCap = true;
        } else {
          this._valves.comCap = false;
        }
        break;
      case 32:
        var zoneCount = this._census.unpoweredZoneCount + this._census.poweredZoneCount;
        if (zoneCount > 0) {
          if (this._census.poweredZoneCount / zoneCount < 0.7 && powerPop > 0) {
            var d = /* @__PURE__ */ new Date();
            if (this._lastPowerMessage === null || d - this._lastPowerMessage > 1e3 * 60 * 2) {
              this._emitEvent(FRONT_END_MESSAGE, { subject: BLACKOUTS_REPORTED });
              this._lastPowerMessage = d;
            }
          }
        }
        break;
      case 35:
        if (this._census.pollutionAverage > 60)
          this._emitEvent(
            FRONT_END_MESSAGE,
            { subject: HIGH_POLLUTION, data: { x: this._map.pollutionMaxX, y: this._map.pollutionMaxY } }
          );
        break;
      case 42:
        if (this._census.crimeAverage > 100)
          this._emitEvent(FRONT_END_MESSAGE, { subject: HIGH_CRIME });
        break;
      case 45:
        if (this._census.totalPop > 60 && this._census.fireStationPop === 0)
          this._emitEvent(FRONT_END_MESSAGE, { subject: NEED_FIRE_STATION });
        break;
      case 48:
        if (this._census.totalPop > 60 && this._census.policeStationPop === 0)
          this._emitEvent(FRONT_END_MESSAGE, { subject: NEED_POLICE_STATION });
        break;
      case 51:
        if (this.budget.cityTax > 12)
          this._emitEvent(FRONT_END_MESSAGE, { subject: TAX_TOO_HIGH });
        break;
      case 54:
        if (this.budget.roadEffect < Math.floor(5 * this.budget.MAX_ROAD_EFFECT / 8) && this._census.roadTotal > 30)
          this._emitEvent(FRONT_END_MESSAGE, { subject: ROAD_NEEDS_FUNDING });
        break;
      case 57:
        if (this.budget.fireEffect < Math.floor(7 * this.budget.MAX_FIRE_STATION_EFFECT / 10) && this._census.totalPop > 20)
          this._emitEvent(FRONT_END_MESSAGE, { subject: FIRE_STATION_NEEDS_FUNDING });
        break;
      case 60:
        if (this.budget.policeEffect < Math.floor(7 * this.budget.MAX_POLICE_STATION_EFFECT / 10) && this._census.totalPop > 20)
          this._emitEvent(FRONT_END_MESSAGE, { subject: POLICE_NEEDS_FUNDING });
        break;
      case 63:
        if (this._census.trafficAverage > 60)
          this._emitEvent(FRONT_END_MESSAGE, { subject: TRAFFIC_JAMS });
        break;
    }
  };
  Simulation.prototype._checkGrowth = function() {
    if ((this._cityTime & 3) !== 0)
      return;
    var message = "";
    var cityPop = this.evaluation.getPopulation(this._census);
    if (cityPop !== this._cityPopLast) {
      var lastClass = this.evaluation.getCityClass(this._cityPopLast);
      var newClass = this.evaluation.getCityClass(cityPop);
      if (lastClass !== newClass) {
        switch (newClass) {
          case Evaluation.CC_VILLAGE:
            break;
          case Evaluation.CC_TOWN:
            message = REACHED_TOWN;
            break;
          case Evaluation.CC_CITY:
            message = REACHED_CITY;
            break;
          case Evaluation.CC_CAPITAL:
            message = REACHED_CAPITAL;
            break;
          case Evaluation.CC_METROPOLIS:
            message = REACHED_METROPOLIS;
            break;
          case Evaluation.CC_MEGALOPOLIS:
            message = REACHED_MEGALOPOLIS;
            break;
          default:
            break;
        }
      }
    }
    if (message !== "" && message !== this._messageLast) {
      this._emitEvent(FRONT_END_MESSAGE, { subject: message });
      this._messageLast = message;
    }
    this._cityPopLast = cityPop;
  };
  Simulation.prototype._onValveChange = function() {
    this._resLast = this._valves.resValve;
    this._comLast = this._valves.comValve;
    this._indLast = this._valves.indValve;
    this._emitEvent(VALVES_UPDATED, {
      residential: this._valves.resValve,
      commercial: this._valves.comValve,
      industrial: this._valves.indValve
    });
  };
  Simulation.prototype.getDate = function() {
    var year = Math.floor(this._cityTime / 48) + this._startingYear;
    var month = Math.floor(this._cityTime % 48) >> 2;
    return { month, year };
  };
  Simulation.prototype._setYear = function(year) {
    if (year < this._startingYear)
      year = this._startingYear;
    year = year - this._startingYear - this._cityTime / 48;
    this._cityTime += year * 48;
    this._updateTime();
  };
  Simulation.prototype._updateTime = function() {
    var megalinium = 1e6;
    var cityYear = Math.floor(this._cityTime / 48) + this._startingYear;
    var cityMonth = Math.floor(this._cityTime % 48) >> 2;
    if (cityYear >= megalinium) {
      this.setYear(startingYear);
      return;
    }
    if (this._cityYearLast !== cityYear || this._cityMonthLast !== cityMonth) {
      this._cityYearLast = cityYear;
      this._cityMonthLast = cityMonth;
      this._emitEvent(DATE_UPDATED, { month: cityMonth, year: cityYear });
    }
  };
  Object.defineProperties(
    Simulation,
    {
      LEVEL_EASY: MiscUtils.makeConstantDescriptor(0),
      LEVEL_MED: MiscUtils.makeConstantDescriptor(1),
      LEVEL_HARD: MiscUtils.makeConstantDescriptor(2),
      SPEED_PAUSED: MiscUtils.makeConstantDescriptor(0),
      SPEED_SLOW: MiscUtils.makeConstantDescriptor(1),
      SPEED_MED: MiscUtils.makeConstantDescriptor(2),
      SPEED_FAST: MiscUtils.makeConstantDescriptor(3)
    }
  );

  // external/micropolisjs/src/wireTool.js
  var WireTool = ConnectingTool(function(map) {
    this.init(5, map, true, true);
  });
  WireTool.prototype.layWire = function(x, y) {
    this.doAutoBulldoze(x, y);
    var cost = this.toolCost;
    var tile3 = this._worldEffects.getTileValue(x, y);
    tile3 = TileUtils.normalizeRoad(tile3);
    switch (tile3) {
      case DIRT:
        this._worldEffects.setTile(x, y, LHPOWER, CONDBIT | BURNBIT | BULLBIT);
        break;
      case RIVER:
      case REDGE:
      case CHANNEL:
        cost = 25;
        if (x < this._map.width - 1) {
          tile3 = this._worldEffects.getTile(x + 1, y);
          if (tile3.isConductive()) {
            tile3 = tile3.getValue();
            tile3 = TileUtils.normalizeRoad(tile3);
            if (tile3 != HROADPOWER && tile3 != RAILHPOWERV && tile3 != HPOWER) {
              this._worldEffects.setTile(x, y, VPOWER, CONDBIT | BULLBIT);
              break;
            }
          }
        }
        if (x > 0) {
          tile3 = this._worldEffects.getTile(x - 1, y);
          if (tile3.isConductive()) {
            tile3 = tile3.getValue();
            tile3 = TileUtils.normalizeRoad(tile3);
            if (tile3 != HROADPOWER && tile3 != RAILHPOWERV && tile3 != HPOWER) {
              this._worldEffects.setTile(x, y, VPOWER, CONDBIT | BULLBIT);
              break;
            }
          }
        }
        if (y < this._map.height - 1) {
          tile3 = this._worldEffects.getTile(x, y + 1);
          if (tile3.isConductive()) {
            tile3 = tile3.getValue();
            tile3 = TileUtils.normalizeRoad(tile3);
            if (tile3 != VROADPOWER && tile3 != RAILVPOWERH && tile3 != VPOWER) {
              this._worldEffects.setTile(x, y, HPOWER, CONDBIT | BULLBIT);
              break;
            }
          }
        }
        if (y > 0) {
          tile3 = this._worldEffects.getTile(x, y - 1);
          if (tile3.isConductive()) {
            tile3 = tile3.getValue();
            tile3 = TileUtils.normalizeRoad(tile3);
            if (tile3 != VROADPOWER && tile3 != RAILVPOWERH && tile3 != VPOWER) {
              this._worldEffects.setTile(x, y, HPOWER, CONDBIT | BULLBIT);
              break;
            }
          }
        }
        return this.TOOLRESULT_FAILED;
      case ROADS:
        this._worldEffects.setTile(x, y, HROADPOWER, CONDBIT | BURNBIT | BULLBIT);
        break;
      case ROADS2:
        this._worldEffects.setTile(x, y, VROADPOWER, CONDBIT | BURNBIT | BULLBIT);
        break;
      case LHRAIL:
        this._worldEffects.setTile(x, y, RAILHPOWERV, CONDBIT | BURNBIT | BULLBIT);
        break;
      case LVRAIL:
        this._worldEffects.setTile(x, y, RAILVPOWERH, CONDBIT | BURNBIT | BULLBIT);
        break;
      default:
        return this.TOOLRESULT_FAILED;
    }
    this.addCost(cost);
    this.checkZoneConnections(x, y);
    return this.TOOLRESULT_OK;
  };
  WireTool.prototype.doTool = function(x, y, blockMaps) {
    this.result = this.layWire(x, y);
  };

  // tooling/vendor/micropolis-engine-entry.mjs
  function createTools(map) {
    return {
      airport: new BuildingTool(1e4, AIRPORT, map, 6, false),
      bulldozer: new BulldozerTool(map),
      coal: new BuildingTool(3e3, POWERPLANT, map, 4, false),
      commercial: new BuildingTool(100, COMCLR, map, 3, false),
      fire: new BuildingTool(500, FIRESTATION, map, 3, false),
      industrial: new BuildingTool(100, INDCLR, map, 3, false),
      nuclear: new BuildingTool(5e3, NUCLEAR, map, 4, true),
      park: new ParkTool(map),
      police: new BuildingTool(500, POLICESTATION, map, 3, false),
      port: new BuildingTool(3e3, PORT, map, 4, false),
      rail: new RailTool(map),
      residential: new BuildingTool(100, FREEZ, map, 3, false),
      road: new RoadTool(map),
      stadium: new BuildingTool(5e3, STADIUM, map, 4, false),
      wire: new WireTool(map)
    };
  }
  return __toCommonJS(micropolis_engine_entry_exports);
})();
