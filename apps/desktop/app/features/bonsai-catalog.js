// Bonsai City building catalog / 盆景城市建筑目录.
// The 256 XBLD-aligned tile ids as data: category, footprint, and a label
// key. Ids and category ranges are format facts (SC2k-docs, attributed in
// docs/city-simulator/OPENSC2K-RESEARCH.md); every label is our own original
// wording — no in-game text from the original product is reproduced.
// Footprints marked here follow the original game's building sizes where
// known and stay approximations until the owner's side-by-side check.
window.AISystem6BonsaiCatalogLoaded = true;

(function initBonsaiCatalog() {
  "use strict";

  // category → default footprint side and label key suffix.
  const CATEGORIES = Object.freeze({
    clear: { size: 1 }, rubble: { size: 1 }, radioactive: { size: 1 }, trees: { size: 1 }, parkSmall: { size: 1 },
    powerLine: { size: 1 }, road: { size: 1 }, rail: { size: 1 }, tunnel: { size: 1 }, crossover: { size: 1 },
    highway: { size: 2 }, bridge: { size: 1 }, onramp: { size: 1 }, subRail: { size: 1 },
    residential: { size: 1 }, commercial: { size: 1 }, industrial: { size: 1 },
    construction: { size: 1 }, abandoned: { size: 1 },
    powerPlant: { size: 4 }, service: { size: 3 }, infrastructure: { size: 1 }, arcology: { size: 4 }, dome: { size: 4 },
  });

  // Range table: [firstId, lastId, category, sizeOverride?].
  const RANGES = [
    [0x00, 0x00, "clear"], [0x01, 0x04, "rubble"], [0x05, 0x05, "radioactive"],
    [0x06, 0x0c, "trees"], [0x0d, 0x0d, "parkSmall"],
    [0x0e, 0x1c, "powerLine"], [0x1d, 0x2b, "road"], [0x2c, 0x3e, "rail"],
    [0x3f, 0x42, "tunnel"], [0x43, 0x48, "crossover"],
    [0x49, 0x50, "highway"], [0x51, 0x5c, "bridge"], [0x5d, 0x60, "onramp"],
    [0x61, 0x69, "highway", 1], [0x6a, 0x6b, "bridge"], [0x6c, 0x6f, "subRail"],
    [0x70, 0x7b, "residential", 1], [0x7c, 0x83, "commercial", 1], [0x84, 0x87, "industrial", 1],
    [0x88, 0x89, "construction", 1], [0x8a, 0x8b, "abandoned", 1],
    [0x8c, 0x93, "residential", 2], [0x94, 0x9d, "commercial", 2], [0x9e, 0xa5, "industrial", 2],
    [0xa6, 0xa9, "construction", 2], [0xaa, 0xad, "abandoned", 2],
    [0xae, 0xb1, "residential", 3], [0xb2, 0xbb, "commercial", 3], [0xbc, 0xc1, "industrial", 3],
    [0xc2, 0xc3, "construction", 3], [0xc4, 0xc5, "abandoned", 3],
    [0xc6, 0xcf, "powerPlant"], [0xd0, 0xdb, "service"], [0xdc, 0xfa, "infrastructure"],
    [0xfb, 0xfe, "arcology"], [0xff, 0xff, "dome"],
  ];

  // Ids whose footprint differs from their category default (original game
  // sizes where known; [verify-during-impl] against the owner's copy).
  const SIZE_OVERRIDES = Object.freeze({
    0xc8: 1, 0xc6: 1, 0xc7: 1,               // wind and the two hydro pieces
    0xdb: 1,                                   // statue
    0xd5: 3,                                   // big park
    0xdc: 1, 0xeb: 2,                          // water pump, water tower
    0xdd: 1, 0xde: 1, 0xe6: 1,                 // runways and tarmac
    0xdf: 1, 0xe0: 1, 0xe1: 2, 0xe2: 2,        // pier, crane, control towers
    0xe3: 1, 0xe4: 1, 0xe5: 1, 0xe7: 1, 0xe8: 1, 0xea: 1,
    0xe9: 1, 0xec: 1, 0xed: 1,                 // subway station, bus station, rail station
    0xee: 1, 0xef: 1, 0xf0: 1, 0xf1: 1, 0xf2: 1,
    0xf3: 2, 0xf4: 1, 0xf5: 2, 0xf6: 1, 0xf7: 1, 0xf8: 2, 0xf9: 1, 0xfa: 2,
  });

  // A few infrastructure ids carry their own label; the rest label by category.
  const LABEL_OVERRIDES = Object.freeze({
    0x05: "radioactive", 0xd0: "city_hall", 0xd1: "hospital", 0xd2: "police", 0xd3: "fire",
    0xd4: "museum", 0xd5: "park_big", 0xd6: "school", 0xd7: "stadium", 0xd8: "prison",
    0xd9: "college", 0xda: "zoo", 0xdb: "statue",
    0xdc: "pump", 0xdd: "runway", 0xde: "runway", 0xdf: "pier", 0xe0: "crane",
    0xe1: "control_tower", 0xe2: "control_tower", 0xe6: "tarmac", 0xe9: "subway_station",
    0xeb: "water_tower", 0xec: "bus_depot", 0xed: "rail_station", 0xf3: "mayors_house",
    0xf4: "water_treatment", 0xf5: "library", 0xf7: "church", 0xf8: "marina",
    0xf9: "missile_silo", 0xfa: "desalination",
  });

  const table = new Array(256).fill(null);
  for (const [first, last, category, sizeOverride] of RANGES) {
    for (let id = first; id <= last; id += 1) {
      table[id] = Object.freeze({
        id,
        category,
        size: SIZE_OVERRIDES[id] != null ? SIZE_OVERRIDES[id] : (sizeOverride != null ? sizeOverride : CATEGORIES[category].size),
        labelKey: `bonsai_catalog_${LABEL_OVERRIDES[id] || category.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`)}`,
      });
    }
  }
  Object.freeze(table);

  function entryOf(id) { return Number.isInteger(id) && id >= 0 && id <= 255 ? table[id] : null; }

  window.AISystem6BonsaiCatalog = Object.freeze({ CATEGORIES, entryOf, table });
})();
