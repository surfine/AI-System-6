// Bonsai City real-place importer / 盆景城市真实地点导入器.
// A square of OpenStreetMap features and one terrain height per cell become
// a Bonsai city payload (the serialize() shape at version 5), which the
// caller runs through AISystem6BonsaiSim.deserialize. The server fetches the
// data (apps/server/server/bonsai-osm.js); this file only maps it, so the
// mapping is testable without the network.
//
// Headless and deterministic: no DOM, no timers, no wall clock, no
// randomness, no network. The same OSM answer and heights always give the
// same city. Map data © OpenStreetMap contributors (ODbL); every imported
// city carries that attribution in its provenance record.
window.AISystem6BonsaiOsmImportLoaded = true;

(function initBonsaiOsmImport() {
  "use strict";

  const CELL_METERS = 16;
  const ATTRIBUTION = "© OpenStreetMap contributors";
  const LICENSE = "ODbL-1.0";
  // One altitude step is 4 m (a tile is 16 voxels of 1 m, a step is 4
  // voxels). Land steeper than one step a tile is shaved to that grade; a
  // place higher than the 30 steps allow is compressed evenly instead.
  const METERS_PER_STEP = 4;
  const TOP_STEP = 30;
  const ZONE = Object.freeze({ NONE: 0, R: 1, C: 2, I: 3 });
  const DENSITY = Object.freeze({ LOW: 1, HIGH: 2 });
  const ACTIVE = 3;
  const VARIANTS_PER_TIER = 8;
  const IMPORT_YEAR = 2000;
  // The longest power line the importer lays between two blocks.
  const WIRE_REACH = 8;

  const HIGHWAY_CLASSES = new Set(["motorway", "trunk"]);
  const LINK_CLASSES = new Set(["motorway_link", "trunk_link"]);
  const ROAD_CLASSES = new Set(["primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "road",
    "primary_link", "secondary_link", "tertiary_link"]);
  const RAIL_CLASSES = new Set(["rail", "light_rail", "narrow_gauge", "monorail", "subway"]);
  const WATER_LINES = Object.freeze({ river: 1, canal: 1 });
  const ZONE_BY_LANDUSE = Object.freeze({
    residential: ZONE.R,
    commercial: ZONE.C, retail: ZONE.C,
    industrial: ZONE.I, warehouse: ZONE.I, port: ZONE.I,
  });
  const PARK_LANDUSE = new Set(["recreation_ground", "village_green", "cemetery", "allotments"]);
  const PARK_LEISURE = new Set(["park", "garden", "golf_course", "nature_reserve", "playground", "recreation_ground", "pitch"]);
  const WOOD = new Set(["forest"]);
  const WOOD_NATURAL = new Set(["wood", "scrub"]);
  const WATER_LANDUSE = new Set(["reservoir", "basin"]);
  const ZONE_BY_BUILDING = Object.freeze({
    house: ZONE.R, detached: ZONE.R, semidetached_house: ZONE.R, terrace: ZONE.R, apartments: ZONE.R, residential: ZONE.R, dormitory: ZONE.R, bungalow: ZONE.R,
    commercial: ZONE.C, retail: ZONE.C, office: ZONE.C, hotel: ZONE.C, supermarket: ZONE.C, kiosk: ZONE.C,
    industrial: ZONE.I, warehouse: ZONE.I, factory: ZONE.I, manufacture: ZONE.I, storage_tank: ZONE.I, hangar: ZONE.I,
  });
  const LOW_RISE_BUILDINGS = new Set(["house", "detached", "semidetached_house", "terrace", "bungalow"]);
  // A civic building is not zoned land in Bonsai: a school, a hospital or a
  // temple is a facility the mayor places, so the importer leaves its ground
  // open and counts it.
  const CIVIC_BUILDINGS = new Set(["school", "university", "college", "hospital", "church", "temple", "mosque", "shrine", "cathedral", "chapel",
    "public", "government", "civic", "fire_station", "police", "train_station", "transportation", "stadium", "sports_hall", "museum", "kindergarten"]);

  // Public services mapped onto their real sites: the core services a
  // Bonsai city pays for (police, fire, schools, hospitals, universities).
  // Clinics, libraries and museums keep their ground open instead; a real
  // district has so many that the game's budget could not keep them all.
  // The order is placement order: large grounds claim their site first.
  const FACILITY_BY_TAG = Object.freeze([
    ["amenity", "hospital", "hospital"], ["amenity", "university", "university"], ["amenity", "college", "university"],
    ["amenity", "police", "police"], ["amenity", "fire_station", "fire"], ["amenity", "school", "school"],
  ]);
  // Two of the same service closer than this are one site mapped twice (a
  // school's grounds and its building, a station's node and its outline),
  // or two that one Bonsai facility's reach already serves: a real street
  // of private practices is one clinic here, not a clinic a block, which no
  // city budget in the game could keep open.
  const FACILITY_MERGE_TILES = 4;
  const mergeTiles = (spec) => Math.max(FACILITY_MERGE_TILES, spec.radius || 0);

  function hash32(value) {
    let h = 0x811c9dc5;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }

  // --- Geometry in grid coordinates ----------------------------------------
  // x grows east, y grows south; cell (x, y) covers [x, x+1) x [y, y+1).

  function projector(area) {
    const n = area.size;
    const sx = n / (area.east - area.west); const sy = n / (area.north - area.south);
    return (lat, lon) => [(lon - area.west) * sx, (area.north - lat) * sy];
  }

  function toPoints(flat, project) {
    const points = [];
    for (let i = 0; i + 1 < flat.length; i += 2) points.push(project(flat[i], flat[i + 1]));
    return points;
  }

  function isClosed(flat) {
    return flat.length >= 8 && flat[0] === flat[flat.length - 2] && flat[1] === flat[flat.length - 1];
  }

  // Liang-Barsky clip of a segment to [lo, hi] on both axes.
  function clipSegment(x0, y0, x1, y1, lo, hi) {
    let t0 = 0; let t1 = 1; const dx = x1 - x0; const dy = y1 - y0;
    const edges = [[-dx, x0 - lo], [dx, hi - x0], [-dy, y0 - lo], [dy, hi - y0]];
    for (const [p, q] of edges) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
  }

  // Every cell a segment passes through, joined edge to edge (a supercover
  // walk): a road that runs diagonally becomes a staircase the simulation
  // can drive, never two cells touching only at a corner.
  function traceSegment(n, ax, ay, bx, by, visit) {
    const clipped = clipSegment(ax, ay, bx, by, -0.5, n + 0.5);
    if (!clipped) return;
    let [x0, y0, x1, y1] = clipped;
    let cx = Math.floor(x0); let cy = Math.floor(y0);
    const ex = Math.floor(x1); const ey = Math.floor(y1);
    const dx = x1 - x0; const dy = y1 - y0;
    const stepX = dx > 0 ? 1 : -1; const stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity; const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tMaxX = dx > 0 ? (cx + 1 - x0) * tDeltaX : dx < 0 ? (x0 - cx) * tDeltaX : Infinity;
    let tMaxY = dy > 0 ? (cy + 1 - y0) * tDeltaY : dy < 0 ? (y0 - cy) * tDeltaY : Infinity;
    const mark = (x, y) => { if (x >= 0 && y >= 0 && x < n && y < n) visit(y * n + x); };
    mark(cx, cy);
    let guard = 4 * (n + 4);
    while ((cx !== ex || cy !== ey) && guard > 0) {
      guard -= 1;
      if (tMaxX < tMaxY) { cx += stepX; tMaxX += tDeltaX; } else if (tMaxY < tMaxX) { cy += stepY; tMaxY += tDeltaY; } else {
        // Through a corner exactly: take one side cell too, so the path
        // stays edge-connected.
        mark(cx + stepX, cy); cx += stepX; cy += stepY; tMaxX += tDeltaX; tMaxY += tDeltaY;
      }
      mark(cx, cy);
    }
  }

  function traceLine(n, points, visit) {
    for (let i = 1; i < points.length; i += 1) traceSegment(n, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], visit);
  }

  // Even-odd fill of every cell whose centre lies inside the rings. The
  // rings may arrive as several open ways (a relation's members); as long as
  // together they close, the crossing count is right.
  function fillRings(n, rings, visit) {
    const edges = [];
    let minY = Infinity; let maxY = -Infinity; let minX = Infinity; let maxX = -Infinity;
    for (const ring of rings) for (let i = 1; i < ring.length; i += 1) {
      const a = ring[i - 1]; const b = ring[i];
      if (a[1] === b[1]) continue;
      edges.push(a[0], a[1], b[0], b[1]);
      minY = Math.min(minY, a[1], b[1]); maxY = Math.max(maxY, a[1], b[1]); minX = Math.min(minX, a[0], b[0]); maxX = Math.max(maxX, a[0], b[0]);
    }
    if (!edges.length || maxY < 0 || minY > n || maxX < 0 || minX > n) return 0;
    let filled = 0;
    const rowFrom = Math.max(0, Math.floor(minY)); const rowTo = Math.min(n - 1, Math.ceil(maxY));
    const xs = [];
    for (let y = rowFrom; y <= rowTo; y += 1) {
      const yc = y + 0.5; xs.length = 0;
      for (let e = 0; e < edges.length; e += 4) {
        const y0 = edges[e + 1]; const y1 = edges[e + 3];
        if ((y0 <= yc) === (y1 <= yc)) continue;
        const x0 = edges[e]; const x1 = edges[e + 2];
        xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(xs[k] - 0.5)); const to = Math.min(n - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
        for (let x = from; x <= to; x += 1) { visit(y * n + x); filled += 1; }
      }
    }
    return filled;
  }

  // A dual carriageway is two OSM ways a lane apart, which trace as a road
  // two tiles wide; so do a plaza's edges and a double track. A tile road is
  // one tile wide, so the strip is thinned: a tile inside a full 2x2 block is
  // removed when its edge neighbours stay joined without it (a 4-connected
  // simple point), scanning until nothing changes. Crossings and bends keep
  // every link they had.
  function thinStrips(n, mask) {
    const at = (x, y) => (x >= 0 && y >= 0 && x < n && y < n ? mask[y * n + x] : 0);
    const inBlock = (x, y) => (at(x - 1, y - 1) && at(x, y - 1) && at(x - 1, y))
      || (at(x, y - 1) && at(x + 1, y - 1) && at(x + 1, y))
      || (at(x + 1, y) && at(x + 1, y + 1) && at(x, y + 1))
      || (at(x, y + 1) && at(x - 1, y + 1) && at(x - 1, y));
    let removed = 0;
    for (let pass = 0; pass < 12; pass += 1) {
      let changed = 0;
      for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) {
        if (!mask[y * n + x] || !inBlock(x, y)) continue;
        // Edge neighbours N, E, S, W; two consecutive ones are joined when
        // the corner between them is road.
        const edge = [at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)];
        const corner = [at(x + 1, y - 1), at(x + 1, y + 1), at(x - 1, y + 1), at(x - 1, y - 1)];
        const present = edge.reduce((sum, value) => sum + (value ? 1 : 0), 0);
        if (present < 2) continue;
        let groups = 0;
        for (let d = 0; d < 4; d += 1) if (edge[d] && !(edge[(d + 3) % 4] && corner[(d + 3) % 4])) groups += 1;
        if (groups !== 1) continue;
        mask[y * n + x] = 0; changed += 1;
      }
      removed += changed;
      if (!changed) break;
    }
    return removed;
  }

  function ringsOf(element, project) {
    if (element.type === "way") return isClosed(element.g) ? [toPoints(element.g, project)] : [];
    return (element.members || []).map((member) => toPoints(member.g, project));
  }

  function areaMeters(points) {
    let sum = 0;
    for (let i = 1; i < points.length; i += 1) sum += points[i - 1][0] * points[i][1] - points[i][0] * points[i - 1][1];
    return Math.abs(sum / 2) * CELL_METERS * CELL_METERS;
  }

  function centroidOf(points) {
    let x = 0; let y = 0; const count = Math.max(1, points.length - 1);
    for (let i = 0; i < count; i += 1) { x += points[i][0]; y += points[i][1]; }
    return [x / count, y / count];
  }

  function levelsOf(tags) {
    const levels = Number.parseFloat(tags["building:levels"]);
    if (Number.isFinite(levels) && levels > 0) return Math.round(levels);
    const height = Number.parseFloat(tags.height);
    if (Number.isFinite(height) && height > 0) return Math.max(1, Math.round(height / 3));
    return 0;
  }

  // --- The import ------------------------------------------------------------

  /**
   * @param {{ osm: { area: object, elements: object[], timestamp?: string, buildings?: boolean },
   *   elevation: { heights: number[] } | null, sim: object, name?: string, seed?: number,
   *   includeBuildings?: boolean, place?: string, retrievedAt?: string }} input
   */
  function importOsm(input) {
    const sim = input.sim;
    const area = input.osm && input.osm.area;
    if (!sim || !area || !sim.SUPPORTED_SIZES.includes(area.size)) throw new Error("bonsai-osm-invalid: area");
    // Sorted here as well as on the server: overlapping areas resolve in
    // this order, so the city must not depend on the order data arrived in.
    const TYPE_ORDER = { node: 0, way: 1, relation: 2 };
    const elements = (Array.isArray(input.osm.elements) ? input.osm.elements : []).slice()
      .sort((a, b) => (TYPE_ORDER[a.type] ?? 3) - (TYPE_ORDER[b.type] ?? 3) || Number(a.id) - Number(b.id));
    const n = area.size; const count = n * n; const project = projector(area);
    const heights = input.elevation && Array.isArray(input.elevation.heights) && input.elevation.heights.length === count ? input.elevation.heights : null;
    const includeBuildings = input.includeBuildings === true && input.osm.buildings === true;
    const warnings = [];
    const stats = { roads: 0, highways: 0, onramps: 0, rails: 0, water: 0, sea: 0, parks: 0, trees: 0, zoned: 0, lots: 0,
      buildings: 0, buildingsPlaced: 0, buildingsNoStreet: 0, buildingsCivic: 0, buildingsNoRoom: 0, tunnelsSkipped: 0 };

    const water = new Uint8Array(count); const salt = new Uint8Array(count);
    const road = new Uint8Array(count); const highway = new Uint8Array(count); const onramp = new Uint8Array(count); const link = new Uint8Array(count);
    const rail = new Uint8Array(count); const bridge = new Uint8Array(count);
    const park = new Uint8Array(count); const tree = new Uint8Array(count);
    const zone = new Uint8Array(count); const density = new Uint8Array(count);
    const civic = new Uint8Array(count); const coast = new Uint8Array(count);

    const areaElements = []; const lineElements = []; const buildings = []; const coastlines = [];
    const serviceSites = [];
    for (const element of elements) {
      const tags = element.tags || {};
      const service = FACILITY_BY_TAG.findIndex(([key, value]) => tags[key] === value);
      if (service >= 0 && sim.FACILITY_KINDS[FACILITY_BY_TAG[service][2]]) serviceSites.push({ element, rank: service, kind: FACILITY_BY_TAG[service][2] });
      if (element.type === "node") continue;
      if (element.type === "way" && tags.natural === "coastline") { coastlines.push(element); continue; }
      if (tags.building && element.type === "way") { buildings.push(element); continue; }
      if (element.type === "way" && (tags.highway || tags.railway || (tags.waterway && WATER_LINES[tags.waterway]))) lineElements.push(element);
      else areaElements.push(element);
    }

    // 1. Water areas, then the sea from the coastline.
    for (const element of areaElements) {
      const tags = element.tags || {};
      const isWater = tags.natural === "water" || tags.natural === "bay" || tags.waterway === "riverbank" || tags.waterway === "dock" || WATER_LANDUSE.has(tags.landuse);
      if (!isWater || tags.intermittent === "yes") continue;
      const isSalt = tags.natural === "bay" || tags.water === "lagoon";
      fillRings(n, ringsOf(element, project), (i) => { water[i] = 1; if (isSalt) salt[i] = 1; });
    }
    for (const element of lineElements) {
      const tags = element.tags || {};
      if (!tags.waterway || tags.tunnel === "yes" || tags.tunnel === "culvert") continue;
      traceLine(n, toPoints(element.g, project), (i) => { water[i] = 1; });
    }
    if (coastlines.length) floodSea();
    function floodSea() {
      // OSM draws coastline with the land on its left. The cell a little to
      // the right of each segment seeds the sea, a little to the left seeds
      // land, and the sea spreads until it meets the traced coast.
      const seaSeeds = []; const landSeed = new Uint8Array(count);
      for (const element of coastlines) {
        const points = toPoints(element.g, project);
        traceLine(n, points, (i) => { coast[i] = 1; });
        for (let k = 1; k < points.length; k += 1) {
          const [ax, ay] = points[k - 1]; const [bx, by] = points[k];
          const length = Math.hypot(bx - ax, by - ay); if (!length) continue;
          // Grid y points south, so the geographic right-hand normal
          // (dy, -dx) in lat/lon turns into (-dy, dx) here.
          const nx = -(by - ay) / length; const ny = (bx - ax) / length;
          const mx = (ax + bx) / 2; const my = (ay + by) / 2;
          const cell = (x, y) => (x >= 0 && y >= 0 && x < n && y < n ? Math.floor(y) * n + Math.floor(x) : -1);
          const sea = cell(mx + nx * 0.75, my + ny * 0.75); const land = cell(mx - nx * 0.75, my - ny * 0.75);
          if (sea >= 0) seaSeeds.push(sea);
          if (land >= 0) landSeed[land] = 1;
        }
      }
      const queue = []; const seen = new Uint8Array(count);
      for (const i of seaSeeds) if (!coast[i] && !landSeed[i] && !seen[i]) { seen[i] = 1; queue.push(i); }
      for (let head = 0; head < queue.length; head += 1) {
        const i = queue[head]; water[i] = 1; salt[i] = 1; stats.sea += 1;
        const x = i % n;
        for (const j of [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, i - n, i + n]) {
          if (j < 0 || j >= count || seen[j] || coast[j] || landSeed[j]) continue;
          seen[j] = 1; queue.push(j);
        }
      }
    }

    // 2. Networks. A road over water keeps the water only where OSM says
    // it is a bridge; elsewhere the road's own cell is dry ground (an
    // embankment the traced river or shore happened to touch).
    for (const element of lineElements) {
      const tags = element.tags || {};
      if (tags.waterway) continue;
      if (tags.tunnel === "yes" || tags.tunnel === "building_passage" || tags.covered === "yes" || tags.location === "underground") { stats.tunnelsSkipped += 1; continue; }
      const onBridge = tags.bridge && tags.bridge !== "no";
      let layer = null;
      if (tags.highway && HIGHWAY_CLASSES.has(tags.highway)) layer = highway;
      else if (tags.highway && LINK_CLASSES.has(tags.highway)) layer = link;
      else if (tags.highway && ROAD_CLASSES.has(tags.highway)) layer = road;
      else if (tags.railway && RAIL_CLASSES.has(tags.railway)) layer = rail;
      if (!layer) continue;
      traceLine(n, toPoints(element.g, project), (i) => {
        layer[i] = 1;
        if (onBridge) bridge[i] = 1;
      });
    }
    thinStrips(n, highway); thinStrips(n, road); thinStrips(n, rail);
    // A highway link is a road where it meets the street and an onramp
    // where it touches the highway, the one joint the simulation accepts.
    for (let i = 0; i < count; i += 1) {
      if (!link[i] || highway[i]) continue;
      const x = i % n; let touchesHighway = false; let touchesRoad = false;
      for (const j of [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, i - n, i + n]) {
        if (j < 0 || j >= count) continue;
        if (highway[j]) touchesHighway = true;
        if (road[j] || (link[j] && !highway[j])) touchesRoad = true;
      }
      if (touchesHighway && touchesRoad) onramp[i] = 1; else road[i] = 1;
    }
    for (let i = 0; i < count; i += 1) {
      if (onramp[i]) { road[i] = 0; highway[i] = 0; }
      const network = road[i] || highway[i] || rail[i] || onramp[i];
      if (network && water[i] && !bridge[i]) { water[i] = 0; salt[i] = 0; }
      if (onramp[i] && water[i]) { onramp[i] = 0; road[i] = 1; }
    }

    const isNetwork = (i) => road[i] || highway[i] || rail[i] || onramp[i];

    // 3. Land cover: zones from landuse, parks, woods, and the ground civic
    // sites stand on.
    const zoneFill = []; const parkFill = []; const woodFill = [];
    for (const element of areaElements) {
      const tags = element.tags || {};
      const rings = ringsOf(element, project);
      if (!rings.length) continue;
      if (ZONE_BY_LANDUSE[tags.landuse]) zoneFill.push({ rings, zone: ZONE_BY_LANDUSE[tags.landuse], order: 0 });
      else if (PARK_LEISURE.has(tags.leisure) || PARK_LANDUSE.has(tags.landuse) || tags.amenity === "grave_yard") parkFill.push(rings);
      else if (WOOD.has(tags.landuse) || WOOD_NATURAL.has(tags.natural)) woodFill.push(rings);
      else if (tags.amenity) fillRings(n, rings, (i) => { civic[i] = 1; });
    }
    for (const item of zoneFill) fillRings(n, item.rings, (i) => { if (!water[i] && !isNetwork(i) && !civic[i]) { zone[i] = item.zone; density[i] = DENSITY.HIGH; } });
    for (const rings of woodFill) fillRings(n, rings, (i) => { if (!water[i] && !isNetwork(i)) tree[i] = 1; });
    for (const rings of parkFill) fillRings(n, rings, (i) => { if (!water[i] && !isNetwork(i)) { park[i] = 1; zone[i] = 0; density[i] = 0; } });
    for (let i = 0; i < count; i += 1) if (zone[i] || park[i]) tree[i] = 0;
    // Parks keep their trees: a park cell with a wood over it is drawn as a
    // park, so the wood is kept only where no park is.

    // 4. Heights. Metres become steps above the lowest dry ground; land is
    // held to one step a tile (the grade roads and lots can use); each body
    // of water lies flat one step under its lowest bank.
    const alt = new Uint8Array(count);
    let step = METERS_PER_STEP; let base = 0;
    if (heights) {
      const dry = []; for (let i = 0; i < count; i += 1) if (!water[i] && Number.isFinite(heights[i])) dry.push(heights[i]);
      dry.sort((a, b) => a - b);
      if (dry.length) {
        // Percentiles, so one bad sample (terrain tiles have pits) does not
        // set the floor or the ceiling.
        base = dry[Math.floor(dry.length * 0.02)];
        const top = dry[Math.min(dry.length - 1, Math.floor(dry.length * 0.995))];
        if ((top - base) / METERS_PER_STEP > TOP_STEP - 2) { step = (top - base) / (TOP_STEP - 2); warnings.push("terrain-compressed"); }
      }
    } else warnings.push("terrain-flat");
    const seaPresent = stats.sea > 0;
    for (let i = 0; i < count; i += 1) {
      if (water[i]) continue;
      const h = heights && Number.isFinite(heights[i]) ? heights[i] : base;
      alt[i] = Math.max(seaPresent ? 1 : 2, Math.min(TOP_STEP, (seaPresent ? 1 : 2) + Math.round((h - base) / step)));
    }
    // Two sweeps of min(neighbour + 1) make the land 1-Lipschitz: every dry
    // tile is within one step of its dry neighbours. Peaks are shaved; the
    // valleys, where the roads run, keep their heights.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) {
        const i = y * n + x; if (water[i]) continue;
        if (x > 0 && !water[i - 1]) alt[i] = Math.min(alt[i], alt[i - 1] + 1);
        if (y > 0 && !water[i - n]) alt[i] = Math.min(alt[i], alt[i - n] + 1);
      }
      for (let y = n - 1; y >= 0; y -= 1) for (let x = n - 1; x >= 0; x -= 1) {
        const i = y * n + x; if (water[i]) continue;
        if (x < n - 1 && !water[i + 1]) alt[i] = Math.min(alt[i], alt[i + 1] + 1);
        if (y < n - 1 && !water[i + n]) alt[i] = Math.min(alt[i], alt[i + n] + 1);
      }
    }
    // Water: flat per connected body, one step under its lowest bank; the sea
    // and any water joined to it (an estuary) lie at 0. Salt stays where the
    // sea and bays put it: a river running into the sea is still fresh.
    const body = new Int32Array(count).fill(-1);
    for (let start = 0; start < count; start += 1) {
      if (!water[start] || body[start] >= 0) continue;
      const cells = [start]; body[start] = start; let bank = Infinity; let salty = false;
      for (let head = 0; head < cells.length; head += 1) {
        const i = cells[head]; const x = i % n; if (salt[i]) salty = true;
        for (const j of [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, i - n, i + n]) {
          if (j < 0 || j >= count) continue;
          if (water[j]) { if (body[j] < 0) { body[j] = start; cells.push(j); } } else bank = Math.min(bank, alt[j]);
        }
      }
      const level = salty || !Number.isFinite(bank) ? 0 : Math.max(0, bank - 1);
      for (const i of cells) alt[i] = level;
    }

    // 5. Public services on their own sites: each becomes the facility the
    // mayor would build there, on the free ground nearest its middle.
    const facilities = []; const facilityCell = new Uint8Array(count);
    const lot = new Uint16Array(count); const stage = new Uint8Array(count); const buildingState = new Uint8Array(count); const variant = new Uint8Array(count);
    const free = (i) => !water[i] && !isNetwork(i) && !park[i] && !lot[i] && !civic[i] && !facilityCell[i];
    const levelPad = (x, y, w, h) => {
      // The pad sits at its cells' middle height; every dry neighbour
      // outside it must end within one step, as the simulation's own
      // levelling demands.
      const values = [];
      for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) values.push(alt[(y + dy) * n + x + dx]);
      values.sort((a, b) => a - b);
      const target = values[Math.floor(values.length / 2)];
      for (let yy = y - 1; yy <= y + h; yy += 1) for (let xx = x - 1; xx <= x + w; xx += 1) {
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
        if ((xx < x || xx >= x + w) && (yy < y || yy >= y + h)) continue;
        const j = yy * n + xx; if (!water[j] && Math.abs(alt[j] - target) > 1) return -1;
      }
      return target;
    };
    serviceSites.sort((a, b) => a.rank - b.rank || (a.element.type < b.element.type ? -1 : a.element.type > b.element.type ? 1 : a.element.id - b.element.id));
    stats.facilities = 0; stats.facilitiesNoRoom = 0;
    for (const site of serviceSites) {
      const spec = sim.FACILITY_KINDS[site.kind];
      const { element } = site;
      const points = element.type === "node" ? [project(element.g[0], element.g[1])]
        : element.type === "way" ? toPoints(element.g, project) : toPoints((element.members.find((m) => m.role === "outer") || element.members[0]).g, project);
      const [cx, cy] = points.length === 1 ? points[0] : centroidOf(points);
      if (cx < 0 || cy < 0 || cx >= n || cy >= n) continue;
      if (facilities.some((item) => item.kind === site.kind && Math.abs(item.x + spec.w / 2 - cx) + Math.abs(item.y + spec.h / 2 - cy) < mergeTiles(spec))) continue;
      const ox = Math.floor(cx - spec.w / 2 + 0.5); const oy = Math.floor(cy - spec.h / 2 + 0.5);
      let spot = null;
      for (let r = 0; r <= 3 && !spot; r += 1) {
        for (let dy = -r; dy <= r && !spot; dy += 1) for (let dx = -r; dx <= r && !spot; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = ox + dx; const y = oy + dy;
          if (x < 0 || y < 0 || x + spec.w > n || y + spec.h > n) continue;
          let fits = true;
          for (let yy = 0; yy < spec.h && fits; yy += 1) for (let xx = 0; xx < spec.w; xx += 1) {
            const c = (y + yy) * n + x + xx;
            if (water[c] || isNetwork(c) || park[c] || facilityCell[c]) { fits = false; break; }
          }
          if (!fits) continue;
          const target = levelPad(x, y, spec.w, spec.h);
          if (target >= 0) spot = { x, y, target };
        }
      }
      if (!spot) { stats.facilitiesNoRoom += 1; continue; }
      for (let yy = 0; yy < spec.h; yy += 1) for (let xx = 0; xx < spec.w; xx += 1) {
        const c = (spot.y + yy) * n + spot.x + xx;
        facilityCell[c] = 1; alt[c] = spot.target; zone[c] = 0; density[c] = 0; tree[c] = 0;
      }
      facilities.push({ kind: site.kind, x: spot.x, y: spot.y, builtTick: 0 });
      stats.facilities += 1;
    }

    // 6. Buildings: each footprint is tiled with the largest square lots
    // (3, 2, then 1 tile) that fit inside it on free, level-enough ground
    // and front a street — a lot away from every street would be empty
    // within a month under the simulation's access rule.
    const frontsStreet = (x, y, s) => {
      for (let k = 0; k < s; k += 1) for (const [tx, ty] of [[x + k, y - 1], [x + k, y + s], [x - 1, y + k], [x + s, y + k]]) {
        if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
        const j = ty * n + tx; if (road[j] || onramp[j]) return true;
      }
      return false;
    };
    if (includeBuildings) {
      const candidates = [];
      for (const element of buildings) {
        const tags = element.tags || {};
        if (!isClosed(element.g)) continue;
        stats.buildings += 1;
        const kind = String(tags.building);
        if (CIVIC_BUILDINGS.has(kind) || (tags.amenity && !ZONE_BY_BUILDING[kind])) { stats.buildingsCivic += 1; continue; }
        const points = toPoints(element.g, project);
        const [cx, cy] = centroidOf(points);
        if (cx < 0 || cy < 0 || cx >= n || cy >= n) continue;
        candidates.push({ id: element.id, tags, kind, points, cx, cy, area: areaMeters(points) });
      }
      // Largest first, so a tower block claims its ground before the kiosk
      // beside it; ties fall to the OSM id, which keeps the answer stable.
      candidates.sort((a, b) => b.area - a.area || a.id - b.id);
      for (const building of candidates) {
        const cells = new Set();
        fillRings(n, [building.points], (i) => cells.add(i));
        if (!cells.size) cells.add(Math.floor(building.cy) * n + Math.floor(building.cx));
        const centreCell = Math.floor(building.cy) * n + Math.floor(building.cx);
        const zoneHere = ZONE_BY_BUILDING[building.kind] || zone[centreCell] || ZONE.R;
        const levels = levelsOf(building.tags);
        const ordered = Array.from(cells).sort((a, b) => a - b);
        let placed = 0; let sawStreetless = false;
        for (const side of [3, 2, 1]) {
          for (const anchor of ordered) {
            const ax = anchor % n; const ay = (anchor - ax) / n;
            if (ax + side > n || ay + side > n) continue;
            let fits = true;
            for (let dy = 0; dy < side && fits; dy += 1) for (let dx = 0; dx < side; dx += 1) {
              const c = anchor + dy * n + dx;
              if (!cells.has(c) || !free(c)) { fits = false; break; }
            }
            if (!fits) continue;
            if (!frontsStreet(ax, ay, side)) { sawStreetless = true; continue; }
            const target = levelPad(ax, ay, side, side);
            if (target < 0) continue;
            const tier = levels >= 10 ? 3 : levels >= 4 ? 2 : levels > 0 ? 1 : side >= 2 ? 2 : 1;
            const rank = tier === 3 ? Math.min(VARIANTS_PER_TIER - 1, Math.floor((levels - 10) / 4)) : hash32(`${building.id}:${anchor}`) % VARIANTS_PER_TIER;
            for (let dy = 0; dy < side; dy += 1) for (let dx = 0; dx < side; dx += 1) {
              const c = anchor + dy * n + dx;
              lot[c] = anchor + 1; stage[c] = side; buildingState[c] = ACTIVE; zone[c] = zoneHere; alt[c] = target; tree[c] = 0;
              density[c] = side >= 2 || levels >= 4 || !LOW_RISE_BUILDINGS.has(building.kind) ? DENSITY.HIGH : DENSITY.LOW;
            }
            variant[anchor] = (tier - 1) * VARIANTS_PER_TIER + 1 + rank;
            stats.lots += 1; placed += 1;
          }
        }
        if (placed) stats.buildingsPlaced += 1;
        else if (sawStreetless) stats.buildingsNoStreet += 1;
        else stats.buildingsNoRoom += 1;
      }
    }

    // 7. Assemble the payload on the shape of a fresh city of this size.
    const seed = Number.isInteger(input.seed) ? input.seed >>> 0 : hash32(`${area.lat},${area.lon},${n}`);
    // The template gives every scalar a fresh city starts with; its layers
    // are all replaced, so the smallest map serves every size.
    const template = sim.serialize(sim.createCity({ seed, size: sim.SUPPORTED_SIZES[0], terrainPreset: "balanced", name: String(input.name || "") }));
    const terrain = new Array(count); const variantOut = Array.from(variant); const shore = new Array(count).fill(0); const slope = new Array(count).fill(0);
    for (let i = 0; i < count; i += 1) {
      const x = i % n; const y = (i - x) / n;
      terrain[i] = water[i] ? 0 : 1 + (hash32(`${seed}:${i}`) % 3);
      if (tree[i] && !lot[i]) variantOut[i] = hash32(`t${seed}:${i}`) % 8;
      let mask = 0;
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], d) => {
        const nx = x + dx; const ny = y + dy; if (nx < 0 || ny < 0 || nx >= n || ny >= n) return;
        const j = ny * n + nx;
        if (!water[i] && water[j]) shore[i] = 1;
        if (alt[j] > alt[i]) mask |= (1 << d);
      });
      slope[i] = mask;
      if (water[i]) stats.water += 1;
      if (road[i]) stats.roads += 1; if (highway[i]) stats.highways += 1; if (onramp[i]) stats.onramps += 1; if (rail[i]) stats.rails += 1;
      if (park[i]) stats.parks += 1; if (tree[i]) stats.trees += 1; if (zone[i]) stats.zoned += 1;
    }
    const zeros = () => new Array(count).fill(0);
    // A real district is lit and piped along its streets, and its blocks are
    // too many to wire by hand. Water: every dry street tile carries a main,
    // underground and out of sight. Power: blocks (zones, lots, facilities)
    // conduct among themselves; streets, parks and open ground do not. So the
    // blocks are joined by the shortest lines between them — every block grows
    // outward at once, one tile a step, over streets and open ground, and
    // where two different groups meet the line between them is laid (a
    // spanning tree, not a fence of poles down every street). A block more
    // than WIRE_REACH tiles from every other is left for the mayor. Supply is
    // still the mayor's to build.
    const wire = zeros(); const pipe = zeros();
    for (let i = 0; i < count; i += 1) if (road[i] && !water[i]) pipe[i] = 1;
    const conductive = (i) => zone[i] || lot[i] || facilityCell[i];
    const wireable = (i) => !conductive(i) && !water[i] && !rail[i] && !highway[i] && !onramp[i] && !park[i];
    const owner = new Int32Array(count).fill(-1); const prev = new Int32Array(count).fill(-1); const reach = new Uint8Array(count);
    const parent = new Int32Array(count).fill(-1);
    const find = (a) => { while (parent[a] >= 0 && parent[a] !== a) { if (parent[parent[a]] >= 0) parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const queue = [];
    // Blocks first: each connected block is one group, labelled by its first
    // cell in reading order.
    for (let start = 0; start < count; start += 1) {
      if (!conductive(start) || owner[start] >= 0) continue;
      const cells = [start]; owner[start] = start; parent[start] = start;
      for (let head = 0; head < cells.length; head += 1) {
        const i = cells[head]; const x = i % n; queue.push(i);
        for (const j of [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, i - n, i + n]) {
          if (j >= 0 && j < count && owner[j] < 0 && conductive(j)) { owner[j] = start; cells.push(j); }
        }
      }
    }
    queue.sort((a, b) => a - b);
    const layWire = (from) => { for (let c = from; c >= 0 && !conductive(c); c = prev[c]) { wire[c] = 1; tree[c] = 0; } };
    for (let head = 0; head < queue.length; head += 1) {
      const i = queue[head]; const x = i % n;
      for (const j of [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, i - n, i + n]) {
        if (j < 0 || j >= count) continue;
        if (owner[j] >= 0) {
          const a = find(owner[i]); const b = find(owner[j]);
          if (a === b || reach[i] + reach[j] + 1 > WIRE_REACH) continue;
          parent[a] = b; layWire(i); layWire(j); stats.powerLinks = (stats.powerLinks || 0) + 1;
        } else if (wireable(j) && reach[i] < WIRE_REACH) {
          owner[j] = owner[i]; prev[j] = i; reach[j] = reach[i] + 1; queue.push(j);
        }
      }
    }
    // An established town arrives with a treasury that can light and water
    // what stands (about $12 of plant per zoned tile at coal and tower
    // prices); a bare map starts with an ordinary new city's money.
    const funds = stats.lots ? template.funds + Math.ceil((stats.zoned * 12) / 1000) * 1000 : template.funds;
    const payload = {
      ...template,
      size: n, name: String(input.name || ""), seed, funds,
      // A real place is imported as it stands today: the modern founding
      // year, so every plant and service the present city uses is buildable.
      yearFounded: IMPORT_YEAR, rngState: seed | 0, terrainPreset: "balanced",
      terrain, alt: Array.from(alt), water: Array.from(water), shore, slope, tree: Array.from(tree),
      road: Array.from(road), rail: Array.from(rail), wire, pipe, park: Array.from(park),
      zone: Array.from(zone), density: Array.from(density), stage: Array.from(stage), buildingState: Array.from(buildingState),
      constructionTimer: zeros(), variant: variantOut, catalogId: zeros(), subway: zeros(), waterLevel: zeros(), salt: Array.from(salt),
      highway: Array.from(highway), onramp: Array.from(onramp), lot: Array.from(lot),
      rotate: zeros(), tunnel: zeros(), waterKind: Array.from(water), blaze: zeros(),
      facilities, spawnCenter: { x: Math.floor(n / 2), y: Math.floor(n / 2) },
      view: { panX: 0, panY: 0, zoom: template.view ? template.view.zoom : 0.82 },
      provenance: {
        source: "openstreetmap", attribution: ATTRIBUTION, license: LICENSE,
        elevation: input.elevation && input.elevation.attribution ? String(input.elevation.attribution) : "",
        place: String(input.place || input.name || "").slice(0, 200),
        center: { lat: area.lat, lon: area.lon }, bbox: { south: area.south, west: area.west, north: area.north, east: area.east },
        cellMeters: CELL_METERS, osmTimestamp: String(input.osm.timestamp || ""), retrievedAt: String(input.retrievedAt || ""),
        buildings: includeBuildings,
      },
    };
    // A fresh city computes its own routing and monthly environment; the
    // template's would describe the noise terrain it was made on.
    delete payload.routing; delete payload.landValue; delete payload.crime; delete payload.pollution;
    if (stats.tunnelsSkipped) warnings.push(`tunnels-skipped:${stats.tunnelsSkipped}`);
    if (stats.buildingsCivic) warnings.push(`civic-buildings-left-open:${stats.buildingsCivic}`);
    if (stats.buildingsNoStreet) warnings.push(`buildings-without-street:${stats.buildingsNoStreet}`);
    if (includeBuildings && !stats.lots) warnings.push("no-buildings-placed");
    warnings.push("no-utility-plants");
    return { payload, warnings, stats, step, base };
  }

  window.AISystem6BonsaiOsmImport = Object.freeze({
    CELL_METERS, ATTRIBUTION, LICENSE, METERS_PER_STEP,
    importOsm, traceLine, fillRings, clipSegment, projector,
  });
})();
