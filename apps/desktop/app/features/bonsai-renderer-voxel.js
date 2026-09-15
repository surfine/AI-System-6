// Bonsai City three.js voxel renderer / 盆景城市体素渲染器.
//
// The second production render backend. It consumes the same pure
// buildRenderSnapshot() reads as the Canvas 2D backend, lazy-loads a bundled
// three.js vendor subset, and draws the city as crisp instanced voxel blocks:
// terrain columns, translucent water, road/rail/wire/pipe/park slabs,
// stage-scaled zone buildings, recipe-driven facilities, coverage overlays,
// and decorative agents. It never mutates simulation state, never consumes
// the core PRNG, and never reads the wall clock — every animated value is a
// pure function of the snapshot.
//
// Public surface parity: the frozen export mirrors AISystem6BonsaiCanvasRenderer
// method for method (mount, isReady, resize, render, pickTile, setPreview,
// clearPreview, renderMiniMap, rotateBy, zoomBy, panByScreen, resetView,
// dispose, debugStats) so the shell can switch backends with one factory swap.
window.AISystem6BonsaiVoxelRendererLoaded = true;

(function initBonsaiVoxelRenderer() {
  "use strict";

  const VENDOR_URL = "/app/vendor/bonsai-renderer.js?v=three-0.185.1-voxel-r3";
  const RECIPE_URL = "/assets/bonsai/atlas-source.json";
  const TEXTURES_URL = "/assets/bonsai/textures.json";
  const TEXTURES_IMAGE_URL = "/assets/bonsai/textures.png";
  const WEBGL_UNAVAILABLE_CODE = "bonsai-voxel-webgl-unavailable";

  const LAYERS = Object.freeze(["voxel"]);
  const CHUNK_SIZE = 16;
  const OVER = Object.freeze({ NONE: 0, ROAD: 1, WIRE: 2, PARK: 3, ROADWIRE: 4 });
  const ZONE = Object.freeze({ NONE: 0, R: 1, C: 2, I: 3 });
  const OVERLAYS = Object.freeze(["none", "power", "water", "traffic", "pollution", "land-value", "police", "fire", "education", "health"]);

  // View constants shared with the Canvas backend (bonsai-renderer.js).
  const PX_PER_TILE = 64;
  const MIN_ZOOM = 0.4;
  const MAX_ZOOM = 2.5;
  const DEFAULT_ZOOM = 0.7;
  const ROTATIONS = 4;

  // Camera elevation of thirty degrees keeps the exact 2:1 ground ratio the
  // Canvas projection draws, so rotation, pan, and zoom feel identical.
  const SIN_ELEVATION = 0.5;
  const COS_ELEVATION = Math.sqrt(3) / 2;
  // World height of one altitude level. Chunky on purpose: terraces must read
  // as stacked blocks, not as the flat 8px lift of the 2D sprites.
  const ALT_STEP = 10 / ((64 / Math.SQRT2) * COS_ELEVATION);
  // Shadow map texels and the sun's stand-off from the camera target. The
  // map follows the visible ground, so 2048 texels cover the widest zoom
  // at about 14 texels per tile and the default zoom at about 28.
  const SHADOW_MAP_SIZE = 2048;
  const SUN_DISTANCE = 220;

  // Small surfaces at device pixel ratio 1 are the low-power phones and
  // tablets; half the texels there keep the frame budget.
  function shadowMapSizeFor(cssWidth, dpr) {
    if ((Number(dpr) || 1) <= 1 && (Number(cssWidth) || 0) < 700) return SHADOW_MAP_SIZE / 2;
    return SHADOW_MAP_SIZE;
  }

  // How much city a viewport shows at a zoom: tiles across the screen width
  // and down its height, the fact the tile-scale review needs from both
  // backends.
  function measureFrame(zoom = DEFAULT_ZOOM, cssWidth = 1024, cssHeight = 640) {
    const scale = pixelsPerWorldUnit(zoom);
    return {
      zoom: clampZoom(zoom),
      pxPerTileEdge: scale,
      tilesAcross: cssWidth / (scale * Math.SQRT2),
      tilesDown: cssHeight / (scale * Math.SQRT2 * 0.5),
    };
  }

  // --- pure helpers: no THREE, no DOM ----------------------------------------

  function clampZoom(zoom) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM));
  }

  function normalizeRotation(rotation) {
    const integer = Number.isFinite(rotation) ? Math.round(rotation) : 0;
    return ((integer % ROTATIONS) + ROTATIONS) % ROTATIONS;
  }

  function mapSize(snapshot) {
    if (Number.isInteger(snapshot?.size) && snapshot.size > 0) return snapshot.size;
    const layer = snapshot?.alt || snapshot?.height || snapshot?.terrain;
    const root = Math.sqrt(layer?.length || 0);
    return Number.isInteger(root) && root > 0 ? root : 64;
  }

  function gridValue(snapshot, names, index, fallback = 0) {
    for (const name of names) {
      const layer = snapshot?.[name];
      if (layer && layer[index] !== undefined) return layer[index];
    }
    return fallback;
  }

  function altitudeAt(snapshot, index) {
    const value = Number(gridValue(snapshot, ["alt", "height", "elevation"], index, 0));
    return Number.isFinite(value) ? value : 0;
  }

  // The altitude ceiling comes from the snapshot data, never from a constant:
  // the v3 sim raises the range and the renderer must follow it.
  function maxAltitude(snapshot) {
    const layer = snapshot?.alt || snapshot?.height || snapshot?.elevation;
    if (!layer || !layer.length) return 0;
    let max = 0;
    for (let i = 0; i < layer.length; i += 1) {
      const value = Number(layer[i]);
      if (Number.isFinite(value) && value > max) max = value;
    }
    return max;
  }

  function isWater(snapshot, index) {
    const terrainType = gridValue(snapshot, ["terrainType"], index, null);
    return Boolean(gridValue(snapshot, ["water"], index, false) || terrainType === "water" || terrainType === 1);
  }

  function isRoad(snapshot, index) {
    const over = gridValue(snapshot, ["over"], index, OVER.NONE);
    return Boolean(gridValue(snapshot, ["road", "roads"], index, false) || over === OVER.ROAD || over === OVER.ROADWIRE);
  }

  function isWire(snapshot, index) {
    const over = gridValue(snapshot, ["over"], index, OVER.NONE);
    return Boolean(gridValue(snapshot, ["wire", "wires", "powerLines"], index, false) || over === OVER.WIRE || over === OVER.ROADWIRE);
  }

  function isRail(snapshot, index) {
    return Boolean(gridValue(snapshot, ["rail", "rails", "railway"], index, false));
  }

  function isPipe(snapshot, index) {
    return Boolean(gridValue(snapshot, ["pipe", "pipes", "waterPipes"], index, false));
  }

  function isTunnel(snapshot, index) {
    return Boolean(gridValue(snapshot, ["tunnel"], index, false));
  }

  function isPark(snapshot, index) {
    return Boolean(gridValue(snapshot, ["park"], index, false)) || gridValue(snapshot, ["over"], index, OVER.NONE) === OVER.PARK;
  }

  function isTree(snapshot, index) {
    return Boolean(gridValue(snapshot, ["tree", "trees"], index, false));
  }

  function terrainKindAt(snapshot, index) {
    if (isWater(snapshot, index)) return "water";
    const terrain = gridValue(snapshot, ["terrainType", "terrain"], index, null);
    if (terrain === "coast" || gridValue(snapshot, ["coast", "shore"], index, false)) return "coast";
    if (terrain === "slope" || gridValue(snapshot, ["slope"], index, false)) return "slope";
    if (terrain === "rock" || terrain === 3) return "rock";
    if (terrain === "soil" || terrain === 2) return "soil";
    return "grass";
  }

  function zonePrefix(value) {
    if (value === ZONE.R || value === "r" || value === "residential") return "r";
    if (value === ZONE.C || value === "c" || value === "commercial") return "c";
    if (value === ZONE.I || value === "i" || value === "industrial") return "i";
    return null;
  }

  function normalizeBuildingState(value) {
    if (Number.isFinite(value)) {
      return ["normal", "foundation", "construction", "normal", "declined", "abandoned", "recovering"][Number(value) | 0] || "normal";
    }
    const stateName = String(value || "normal").toLowerCase();
    if (stateName === "decay" || stateName === "decline" || stateName === "declining") return "declined";
    if (["foundation", "construction", "normal", "declined", "abandoned", "recovering"].includes(stateName)) return stateName;
    return "normal";
  }

  function normalizeFootprint(value, fallbackWidth = 1, fallbackHeight = fallbackWidth) {
    if (Array.isArray(value)) return { w: Math.max(1, Number(value[0]) || 1), h: Math.max(1, Number(value[1]) || 1) };
    if (value && typeof value === "object") {
      return { w: Math.max(1, Number(value.w || value.width) || 1), h: Math.max(1, Number(value.h || value.height) || 1) };
    }
    return { w: Math.max(1, Number(fallbackWidth) || 1), h: Math.max(1, Number(fallbackHeight) || 1) };
  }

  function normalizeFacilityKind(kind) {
    const value = String(kind || "").toLowerCase();
    if (value.includes("coal") || value.includes("power")) return "coal";
    if (value.includes("wind")) return "wind";
    if (value.includes("pump")) return "pump";
    if (value.includes("tower")) return "tower";
    if (value.includes("police")) return "police";
    if (value.includes("fire")) return "fire";
    if (value.includes("school") || value.includes("education")) return "school";
    if (value.includes("clinic") || value.includes("hospital") || value.includes("medical")) return "clinic";
    if (value.includes("station") || value.includes("rail")) return "station";
    return "school";
  }

  // Deterministic hashes for view-only variation. These never touch the core
  // PRNG and never read a clock.
  function fnvUpdate(hash, value) {
    hash ^= Number(value) | 0;
    return Math.imul(hash, 16777619) >>> 0;
  }

  function fnvAny(hash, value) {
    if (typeof value !== "string") return fnvUpdate(hash, value);
    for (const char of value) hash = fnvUpdate(hash, char.charCodeAt(0));
    return hash;
  }

  function hashTile(index) {
    let x = index | 0;
    x = (x ^ (x >>> 16)) | 0;
    x = Math.imul(x, 0x45d9f3b) | 0;
    x = (x ^ (x >>> 16)) | 0;
    return x >>> 0;
  }

  // Day/night gate shared with the Canvas backend: the sim clock carries a
  // time of day; night swaps wall textures to lit-window variants. It is a
  // binary renderer state so chunks rebuild only at dusk and dawn.
  function isNight(snapshot) {
    const time = Number.isFinite(snapshot.timeOfDay)
      ? snapshot.timeOfDay
      : ((Number(snapshot.tick) || 0) % 600) / 600;
    const sun = Math.sin(time * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    return sun < 0.32;
  }

  // Orthogonal neighbours (screen-diagonal in the 2:1 projection), 1=N 2=E
  // 4=S 8=W — the same mask grammar the Canvas connector painter uses, so
  // path decorations continue across tile edges and turn corners.
  function networkMask(snapshot, x, y, size, predicate) {
    let mask = 0;
    if (y > 0 && predicate(snapshot, (y - 1) * size + x)) mask |= 1;
    if (x < size - 1 && predicate(snapshot, y * size + x + 1)) mask |= 2;
    if (y < size - 1 && predicate(snapshot, (y + 1) * size + x)) mask |= 4;
    if (x > 0 && predicate(snapshot, y * size + x - 1)) mask |= 8;
    return mask;
  }

  // --- recipes: the declarative micro-voxel source drives every color --------

  // Minimal recipe used when /assets/bonsai/atlas-source.json cannot load.
  // Values mirror the shipped palette so the fallback stays on-brand.
  const FALLBACK_RECIPE_SOURCE = Object.freeze({
    palette: {
      grass: [78, 132, 68, 255], grassLight: [108, 160, 82, 255], grassDark: [48, 92, 48, 255],
      soil: [132, 94, 58, 255], soilLight: [162, 120, 76, 255],
      rock: [116, 116, 112, 255], rockLight: [154, 154, 146, 255],
      water: [47, 105, 159, 224], waterLight: [80, 151, 194, 236], sand: [194, 167, 108, 255],
      road: [79, 79, 76, 255], roadLight: [126, 126, 118, 255],
      rail: [70, 61, 52, 255], metal: [168, 170, 164, 255], wire: [42, 45, 43, 255], pipe: [55, 133, 160, 255],
      tree: [38, 112, 53, 255], treeLight: [70, 151, 66, 255], trunk: [102, 70, 42, 255],
      residential: [181, 92, 78, 255], residentialLight: [224, 151, 124, 255],
      commercial: [72, 105, 173, 255], commercialLight: [127, 166, 221, 255],
      industrial: [176, 126, 61, 255], industrialLight: [222, 174, 91, 255],
      glass: [137, 192, 203, 255], concrete: [177, 174, 159, 255],
      construction: [220, 153, 48, 255], abandoned: [74, 72, 66, 255],
      police: [55, 84, 164, 255], fire: [186, 62, 50, 255], school: [177, 151, 86, 255], clinic: [205, 215, 207, 255],
      white: [239, 239, 226, 255], black: [25, 27, 25, 255], red: [202, 55, 48, 255], yellow: [225, 193, 69, 255],
    },
    buildingFamilies: [
      { zone: "residential", prefix: "r", base: "residential", light: "residentialLight" },
      { zone: "commercial", prefix: "c", base: "commercial", light: "commercialLight" },
      { zone: "industrial", prefix: "i", base: "industrial", light: "industrialLight" },
    ],
    buildingStages: [
      { stage: 1, footprint: [1, 1], height: 24 },
      { stage: 2, footprint: [2, 2], height: 46 },
      { stage: 3, footprint: [3, 3], height: 70 },
    ],
    facilities: [
      { id: "facility.coal", footprint: [2, 2], height: 66, base: "abandoned", light: "metal" },
      { id: "facility.wind", footprint: [1, 1], height: 78, base: "white", light: "metal" },
      { id: "facility.pump", footprint: [1, 1], height: 30, base: "pipe", light: "glass" },
      { id: "facility.tower", footprint: [1, 1], height: 62, base: "pipe", light: "metal" },
      { id: "facility.police", footprint: [1, 1], height: 34, base: "police", light: "commercialLight" },
      { id: "facility.fire", footprint: [1, 1], height: 34, base: "fire", light: "residentialLight" },
      { id: "facility.school", footprint: [1, 1], height: 32, base: "school", light: "industrialLight" },
      { id: "facility.clinic", footprint: [1, 1], height: 38, base: "clinic", light: "white" },
      { id: "facility.station", footprint: [2, 2], height: 36, base: "rail", light: "metal" },
    ],
  });

  function paletteColor(palette, name, fallback) {
    const raw = palette[name] || palette[fallback] || [128, 128, 128, 255];
    return {
      r: (Number(raw[0]) || 0) / 255,
      g: (Number(raw[1]) || 0) / 255,
      b: (Number(raw[2]) || 0) / 255,
      a: raw[3] === undefined ? 1 : (Number(raw[3]) || 0) / 255,
    };
  }

  function shade(color, factor) {
    return {
      r: Math.max(0, Math.min(1, color.r * factor)),
      g: Math.max(0, Math.min(1, color.g * factor)),
      b: Math.max(0, Math.min(1, color.b * factor)),
      a: color.a,
    };
  }

  function hexColor(hex, alpha = 1) {
    const value = parseInt(String(hex).slice(1), 16) | 0;
    return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255, a: alpha };
  }

  // Turn the declarative atlas source (palette + families + stages +
  // facilities) into the color and size tables the block collectors read.
  function buildRecipes(source) {
    const raw = source && typeof source === "object" ? source : FALLBACK_RECIPE_SOURCE;
    const palette = raw.palette && typeof raw.palette === "object" ? raw.palette : FALLBACK_RECIPE_SOURCE.palette;
    const color = (name, fallback) => paletteColor(palette, name, fallback);

    // Soil and rock scatter tile-by-tile through the generated map, so at
    // full palette strength the ground read as a pastel checkerboard. Their
    // tops lean toward grass and the ground reads as one surface with
    // earthy and stony variation, the SC2000 continuous-ground look.
    const lean = (a, b, t) => ({
      r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t, a: a.a,
    });
    const grassTop = color("grass");
    const terrain = {
      grass: { top: grassTop, side: color("soil") },
      soil: { top: lean(grassTop, color("soilLight"), 0.16), side: color("soil") },
      rock: { top: lean(grassTop, color("rockLight"), 0.18), side: color("rock") },
      coast: { top: color("sand"), side: color("soil") },
      slope: { top: lean(grassTop, color("grassLight"), 0.55), side: color("soil") },
      water: { surface: color("water"), lit: color("waterLight"), bed: color("grassDark") },
    };

    const connectors = {
      road: color("road"),
      roadAccent: color("roadLight"),
      rail: color("rail"),
      railAccent: color("metal"),
      wire: color("wire"),
      pipe: color("pipe"),
      park: color("grassLight"),
    };

    const families = {};
    const familySource = Array.isArray(raw.buildingFamilies) && raw.buildingFamilies.length
      ? raw.buildingFamilies
      : FALLBACK_RECIPE_SOURCE.buildingFamilies;
    familySource.forEach((family) => {
      if (!family || !family.prefix) return;
      families[family.prefix] = { base: color(family.base), light: color(family.light, family.base) };
    });

    const stages = {};
    const stageSource = Array.isArray(raw.buildingStages) && raw.buildingStages.length
      ? raw.buildingStages
      : FALLBACK_RECIPE_SOURCE.buildingStages;
    stageSource.forEach((entry) => {
      if (!entry || !Number.isFinite(entry.stage)) return;
      stages[entry.stage] = {
        footprint: normalizeFootprint(entry.footprint),
        height: Math.max(0.2, (Number(entry.height) || 24) / PX_PER_TILE),
        heightPx: Number(entry.height) || 24,
      };
    });

    const facilities = {};
    const facilitySource = Array.isArray(raw.facilities) && raw.facilities.length
      ? raw.facilities
      : FALLBACK_RECIPE_SOURCE.facilities;
    facilitySource.forEach((entry) => {
      if (!entry || !entry.id) return;
      const kind = String(entry.id).split(".").pop();
      facilities[kind] = {
        footprint: normalizeFootprint(entry.footprint),
        height: Math.max(0.2, (Number(entry.height) || 30) / PX_PER_TILE),
        heightPx: Number(entry.height) || 30,
        base: color(entry.base, "concrete"),
        light: color(entry.light, "white"),
      };
    });

    // Catalog specials digest exactly like facilities: bespoke blocks for the
    // imported-tile labels that have their own recipe, keyed by label.
    const catalog = {};
    (Array.isArray(raw.catalogSpecials) ? raw.catalogSpecials : []).forEach((entry) => {
      if (!entry || !entry.id) return;
      const label = String(entry.id).split(".").pop();
      catalog[label] = {
        footprint: normalizeFootprint(entry.footprint),
        height: Math.max(0.2, (Number(entry.height) || 24) / PX_PER_TILE),
        base: color(entry.base, "concrete"),
        light: color(entry.light, "white"),
      };
    });

    const states = {
      foundation: { color: color("concrete"), heightScale: 0.12 },
      construction: { color: color("construction"), heightScale: 0.6 },
      normal: { color: null, heightScale: 1 },
      declined: { color: null, heightScale: 1, shade: 0.72 },
      abandoned: { color: color("abandoned"), heightScale: 1 },
      recovering: { color: null, heightScale: 1, shade: 0.9 },
    };

    const things = {
      airplane: color("white"),
      helicopter: color("red"),
      hull: color("trunk", "rail"),
      top: color("white"),
    };

    const agents = {
      car: [color("red"), color("commercial"), color("industrialLight"), color("white")],
      pedestrian: [color("residentialLight"), color("commercialLight")],
      train: [color("rail"), color("metal")],
      service: [color("police"), color("fire"), color("clinic")],
      smoke: [color("white"), color("concrete"), color("metal")],
    };

    return {
      terrain,
      connectors,
      families,
      stages,
      facilities,
      catalog,
      things,
      // The 2D composer's grammar (massing, roof, clutter, walls) and a
      // palette lookup, so the block composer below reads the same recipes.
      grammar: raw.buildingGrammar && typeof raw.buildingGrammar === "object" ? raw.buildingGrammar : null,
      facilityGrammar: raw.facilityGrammar && typeof raw.facilityGrammar === "object" ? raw.facilityGrammar : null,
      paletteColor: (name, fallback) => color(name, fallback),
      // The same category hues the Canvas backend paints for catalog tiles
      // with no recipe of their own, so the two backends agree on color.
      catalogCategories: {
        rubble: hexColor("#7c7168"), radioactive: hexColor("#86a03a"),
        construction: hexColor("#a08f6a"), abandoned: hexColor("#6e6258"),
        powerPlant: hexColor("#6f6f78"), service: hexColor("#7a6fae"), infrastructure: hexColor("#8a8f98"),
        arcology: hexColor("#4f8f7a"), dome: hexColor("#c0a040"), highway: hexColor("#4a4a52"),
        bridge: hexColor("#4a4a52"), onramp: hexColor("#4a4a52"), tunnel: hexColor("#5a5148"),
        subRail: hexColor("#66707a"), parkSmall: hexColor("#5f9550"),
        residential: hexColor("#b75d52"), commercial: hexColor("#486eaf"), industrial: hexColor("#b67c3b"),
      },
      blaze: {
        fireYoung: hexColor("#e8862a"),
        fireOld: hexColor("#d1481f"),
        ember: hexColor("#f4c84a"),
        flood: hexColor("#4080c8", 0.75),
      },
      states,
      agents,
      tree: { trunk: color("trunk"), canopy: color("tree"), canopyLight: color("treeLight") },
      zoneTint: {
        r: { ...color("residential"), a: 0.26 },
        c: { ...color("commercial"), a: 0.26 },
        i: { ...color("industrial"), a: 0.26 },
      },
      preview: {
        accepted: { r: 43 / 255, g: 177 / 255, b: 75 / 255, a: 0.4 },
        rejected: { r: 205 / 255, g: 55 / 255, b: 49 / 255, a: 0.45 },
      },
    };
  }

  // --- overlays: same field names, buckets, and colors as the Canvas path ----

  function normalizeOverlay(value) {
    const normalized = String(value || "none").toLowerCase().replaceAll("_", "-");
    if (normalized === "landvalue") return "land-value";
    return OVERLAYS.includes(normalized) ? normalized : "none";
  }

  function overlayValue(snapshot, overlay, index) {
    const direct = {
      power: ["powered", "powerCoverage"],
      water: ["watered", "waterCoverage"],
      traffic: ["traffic"],
      pollution: ["pollution"],
      "land-value": ["landValue", "land-value"],
      police: ["policeCovered", "policeCoverage"],
      fire: ["fireCovered", "fireCoverage"],
      education: ["educationCovered", "educationCoverage"],
      health: ["healthCovered", "healthCoverage"],
    }[overlay] || [];
    for (const name of direct) {
      const layer = snapshot?.[name];
      if (layer && layer[index] !== undefined) return Number(layer[index]) || 0;
    }
    const nested = snapshot?.coverage?.[overlay] || snapshot?.overlays?.[overlay];
    return nested && nested[index] !== undefined ? Number(nested[index]) || 0 : 0;
  }

  function overlayBucket(overlay, value) {
    if (["power", "water", "police", "fire", "education", "health"].includes(overlay)) return value ? 1 : 0;
    const divisor = overlay === "traffic" ? 160 : 255;
    return Math.max(0, Math.min(4, Math.floor((value / divisor) * 5)));
  }

  const OVERLAY_BINARY_COLORS = Object.freeze({
    power: [{ r: 0.714, g: 0.188, b: 0.176, a: 0.28 }, { r: 0.969, g: 0.804, b: 0.263, a: 0.42 }],
    water: [{ r: 0.643, g: 0.239, b: 0.212, a: 0.25 }, { r: 0.216, g: 0.604, b: 0.827, a: 0.44 }],
    police: [{ r: 0.325, g: 0.275, b: 0.275, a: 0.2 }, { r: 0.255, g: 0.412, b: 0.839, a: 0.42 }],
    fire: [{ r: 0.325, g: 0.275, b: 0.275, a: 0.2 }, { r: 0.906, g: 0.357, b: 0.2, a: 0.42 }],
    education: [{ r: 0.325, g: 0.275, b: 0.275, a: 0.2 }, { r: 0.902, g: 0.722, b: 0.224, a: 0.42 }],
    health: [{ r: 0.325, g: 0.275, b: 0.275, a: 0.2 }, { r: 0.212, g: 0.71, b: 0.576, a: 0.42 }],
  });

  const OVERLAY_HEAT_COLORS = Object.freeze({
    traffic: [
      { r: 0.275, g: 0.647, b: 0.318, a: 0.17 }, { r: 0.608, g: 0.722, b: 0.259, a: 0.25 },
      { r: 0.878, g: 0.722, b: 0.224, a: 0.31 }, { r: 0.878, g: 0.439, b: 0.176, a: 0.38 },
      { r: 0.753, g: 0.18, b: 0.169, a: 0.48 },
    ],
    pollution: [
      { r: 0.314, g: 0.576, b: 0.322, a: 0.12 }, { r: 0.518, g: 0.569, b: 0.282, a: 0.23 },
      { r: 0.651, g: 0.502, b: 0.255, a: 0.31 }, { r: 0.569, g: 0.322, b: 0.361, a: 0.4 },
      { r: 0.392, g: 0.188, b: 0.443, a: 0.49 },
    ],
    "land-value": [
      { r: 0.698, g: 0.212, b: 0.188, a: 0.38 }, { r: 0.792, g: 0.435, b: 0.184, a: 0.34 },
      { r: 0.808, g: 0.682, b: 0.235, a: 0.31 }, { r: 0.392, g: 0.639, b: 0.294, a: 0.35 },
      { r: 0.145, g: 0.498, b: 0.29, a: 0.44 },
    ],
  });

  function overlayColor(overlay, bucket) {
    const binary = OVERLAY_BINARY_COLORS[overlay];
    if (binary) return binary[bucket ? 1 : 0];
    const heat = OVERLAY_HEAT_COLORS[overlay] || OVERLAY_HEAT_COLORS.traffic;
    return heat[Math.max(0, Math.min(heat.length - 1, bucket))];
  }

  // --- camera rig: pure view state in Canvas-backend units -------------------

  function cameraBasis(view) {
    const azimuth = Math.PI / 4 + normalizeRotation(view.rotation) * (Math.PI / 2);
    return {
      azimuth,
      rightX: Math.cos(azimuth),
      rightZ: -Math.sin(azimuth),
      upX: -Math.sin(azimuth),
      upZ: -Math.cos(azimuth),
    };
  }

  function pixelsPerWorldUnit(zoom) {
    return (PX_PER_TILE * clampZoom(zoom)) / Math.SQRT2;
  }

  function cameraTarget(view, size) {
    const basis = cameraBasis(view);
    const scale = pixelsPerWorldUnit(view.zoom);
    const panX = Number.isFinite(view.panX) ? view.panX : 0;
    const panY = Number.isFinite(view.panY) ? view.panY : 0;
    const alongRight = -panX / scale;
    const alongUp = (2 * panY) / scale;
    return {
      x: size / 2 + alongRight * basis.rightX + alongUp * basis.upX,
      z: size / 2 + alongRight * basis.rightZ + alongUp * basis.upZ,
    };
  }

  function cameraRig(view, size, cssWidth, cssHeight) {
    const basis = cameraBasis(view);
    const scale = pixelsPerWorldUnit(view.zoom);
    const target = cameraTarget(view, size);
    const distance = size * 2 + 60;
    return {
      targetX: target.x,
      targetY: 0,
      targetZ: target.z,
      eyeX: target.x + distance * COS_ELEVATION * Math.sin(basis.azimuth),
      eyeY: distance * SIN_ELEVATION,
      eyeZ: target.z + distance * COS_ELEVATION * Math.cos(basis.azimuth),
      halfW: Math.max(1, cssWidth) / (2 * scale),
      halfH: Math.max(1, cssHeight) / (2 * scale),
      near: 0.1,
      far: distance * 3,
      pxPerWorld: scale,
    };
  }

  // Forward projection of a world point to css pixels. This is the same map
  // the orthographic camera applies, kept pure so tests can hold the parity
  // contract without WebGL.
  function projectPoint(view, size, cssWidth, cssHeight, worldX, worldY, worldZ) {
    const basis = cameraBasis(view);
    const scale = pixelsPerWorldUnit(view.zoom);
    const target = cameraTarget(view, size);
    const dx = worldX - target.x;
    const dz = worldZ - target.z;
    return {
      sx: cssWidth / 2 + (dx * basis.rightX + dz * basis.rightZ) * scale,
      sy: cssHeight / 2 - ((dx * basis.upX + dz * basis.upZ) * SIN_ELEVATION + worldY * COS_ELEVATION) * scale,
    };
  }

  // Inverse projection at a known altitude, mirroring the Canvas backend's
  // two-pass refinement contract.
  function unprojectGround(view, size, cssWidth, cssHeight, sx, sy, altitude = 0) {
    const basis = cameraBasis(view);
    const scale = pixelsPerWorldUnit(view.zoom);
    const target = cameraTarget(view, size);
    const alongRight = (sx - cssWidth / 2) / scale;
    const vertical = (cssHeight / 2 - sy) / scale;
    const alongUp = (vertical - altitude * ALT_STEP * COS_ELEVATION) / SIN_ELEVATION;
    return {
      worldX: target.x + alongRight * basis.rightX + alongUp * basis.upX,
      worldZ: target.z + alongRight * basis.rightZ + alongUp * basis.upZ,
    };
  }

  function tileFromScreen(view, size, cssWidth, cssHeight, sx, sy, altitude = 0) {
    const ground = unprojectGround(view, size, cssWidth, cssHeight, sx, sy, altitude);
    // Tile centers can land one IEEE-754 ulp below an integer after the
    // forward/inverse pair; the epsilon keeps representable centers stable.
    return { x: Math.floor(ground.worldX + 1e-9), y: Math.floor(ground.worldZ + 1e-9) };
  }

  // The pan that puts a tile center at the viewport middle, for resetView
  // parity with the Canvas backend's center option.
  function panToCenter(center, size, view, cssWidth, cssHeight) {
    const centered = { zoom: view.zoom, rotation: view.rotation, panX: 0, panY: 0 };
    const point = projectPoint(centered, size, cssWidth, cssHeight, center.x + 0.5, 0, center.y + 0.5);
    return { panX: cssWidth / 2 - point.sx, panY: cssHeight / 2 - point.sy };
  }

  // --- deterministic lighting from snapshot time -----------------------------

  function lightingFor(timeOfDay) {
    const time = Number.isFinite(timeOfDay) ? timeOfDay : 0.5;
    const sun = Math.sin(time * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    const dayFactor = Math.max(0.14, Math.min(1, sun * 1.15));
    const mix = (day, night) => night + (day - night) * dayFactor;
    return {
      sunX: Math.cos(time * Math.PI * 2) * 0.8,
      sunY: 0.55 + sun * 0.65,
      sunZ: 0.45,
      sunIntensity: 0.25 + dayFactor * 0.7,
      ambientIntensity: 0.34 + dayFactor * 0.3,
      skyR: mix(0.11, 0.043), skyG: mix(0.165, 0.059), skyB: mix(0.125, 0.094),
      dayFactor,
    };
  }

  function waterBob(timeOfDay) {
    const time = Number.isFinite(timeOfDay) ? timeOfDay : 0;
    return Math.sin(time * Math.PI * 6) * 0.035;
  }

  // --- scene objects: buildings and facilities as normalized lists -----------

  function collectSceneObjects(snapshot, recipes) {
    const size = mapSize(snapshot);
    const buildings = [];
    const covered = new Set();
    if (Array.isArray(snapshot?.buildings)) {
      snapshot.buildings.forEach((building) => {
        if (!Number.isFinite(building?.x) || !Number.isFinite(building?.y)) return;
        const footprint = normalizeFootprint(building.footprint, building.w || building.width, building.h || building.height);
        buildings.push({ ...building, footprint });
        for (let dy = 0; dy < footprint.h; dy += 1) {
          for (let dx = 0; dx < footprint.w; dx += 1) covered.add(`${building.x + dx}:${building.y + dy}`);
        }
      });
    }
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (covered.has(`${x}:${y}`)) continue;
        const index = y * size + x;
        const stage = Number(gridValue(snapshot, ["stage", "buildingStage"], index, 0)) | 0;
        const zone = gridValue(snapshot, ["zone", "zoneType"], index, ZONE.NONE);
        const buildingState = gridValue(snapshot, ["buildingState"], index, stage > 0 ? 3 : 0);
        if ((!stage && !buildingState) || !zonePrefix(zone)) continue;
        buildings.push({
          x, y, zone, stage,
          variant: Number(gridValue(snapshot, ["variant", "buildingVariant"], index, 1)) || 1,
          state: buildingState,
          footprint: { w: 1, h: 1 },
          // Derived tile by tile, not grouped by the core: a tall stage on a
          // one-tile lot must not become a needle.
          derived: true,
        });
      }
    }

    const facilities = [];
    const lists = Array.isArray(snapshot?.facilities) ? [snapshot.facilities] : [snapshot?.plants, snapshot?.services];
    lists.forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((object) => {
        if (!Number.isFinite(object?.x) || !Number.isFinite(object?.y)) return;
        const kind = normalizeFacilityKind(object.kind || object.type);
        const recipe = recipes.facilities[kind] || recipes.facilities.school;
        facilities.push({
          ...object,
          kind,
          footprint: normalizeFootprint(object.footprint || recipe?.footprint),
        });
      });
    });

    // Blaze tiles (fire and flood) and imported catalog tiles mirror the
    // Canvas backend's scenery gating tile for tile, so the two backends
    // show the same city.
    const blazeTiles = [];
    if (snapshot?.blaze) {
      for (let index = 0; index < size * size; index += 1) {
        const value = Number(snapshot.blaze[index]) || 0;
        if (!value) continue;
        blazeTiles.push({ x: index % size, y: Math.floor(index / size), flooded: value === 6, age: value });
      }
    }
    const catalog = typeof window !== "undefined" ? window.AISystem6BonsaiCatalog : null;
    const catalogObjects = window.AISystem6BonsaiRenderer?.collectCatalogObjects(snapshot, catalog) || [];
    const catalogTiles = catalogObjects.filter((object) => !object.spriteId);
    catalogObjects.filter((object) => object.spriteId).forEach((object) => {
      facilities.push({ x: object.x, y: object.y, kind: object.spriteId.split(".")[1], footprint: object.footprint });
    });

    return { buildings, facilities, covered, blazeTiles, catalogTiles };
  }

  // --- chunk signatures: only dirty 16x16 chunks rebuild ---------------------

  function chunkSignature(snapshot, chunkX, chunkY, sceneObjects) {
    const size = mapSize(snapshot);
    const startX = chunkX * CHUNK_SIZE;
    const startY = chunkY * CHUNK_SIZE;
    const endX = Math.min(size, startX + CHUNK_SIZE);
    const endY = Math.min(size, startY + CHUNK_SIZE);
    let hash = 2166136261;
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const index = y * size + x;
        hash = fnvUpdate(hash, altitudeAt(snapshot, index));
        hash = fnvUpdate(hash, isWater(snapshot, index));
        hash = fnvAny(hash, String(gridValue(snapshot, ["terrainType", "terrain"], index, "")).length);
        hash = fnvUpdate(hash, isRoad(snapshot, index));
        hash = fnvUpdate(hash, isRail(snapshot, index));
        hash = fnvUpdate(hash, isWire(snapshot, index));
        hash = fnvUpdate(hash, isPipe(snapshot, index));
        hash = fnvUpdate(hash, isTunnel(snapshot, index));
        hash = fnvUpdate(hash, isPark(snapshot, index));
        hash = fnvUpdate(hash, isTree(snapshot, index));
        hash = fnvAny(hash, gridValue(snapshot, ["zone", "zoneType"], index, 0));
        hash = fnvUpdate(hash, Number(gridValue(snapshot, ["stage", "buildingStage"], index, 0)) || 0);
        hash = fnvUpdate(hash, Number(gridValue(snapshot, ["variant", "buildingVariant"], index, 0)) || 0);
        hash = fnvAny(hash, gridValue(snapshot, ["buildingState"], index, 0));
        hash = fnvUpdate(hash, Number(gridValue(snapshot, ["waterLevel"], index, 0)) || 0);
        hash = fnvUpdate(hash, Boolean(gridValue(snapshot, ["salt"], index, false)));
        hash = fnvUpdate(hash, Number(gridValue(snapshot, ["catalogId"], index, 0)) || 0);
        hash = fnvUpdate(hash, Number(gridValue(snapshot, ["blaze"], index, 0)) || 0);
        hash = fnvUpdate(hash, Boolean(gridValue(snapshot, ["highway"], index, false)));
        hash = fnvUpdate(hash, Boolean(gridValue(snapshot, ["onramp"], index, false)));
      }
    }
    hash = fnvUpdate(hash, isNight(snapshot) ? 1 : 0);
    hash = fnvUpdate(hash, Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375));
    const inChunk = (object) => object.x >= startX && object.x < endX && object.y >= startY && object.y < endY;
    (sceneObjects?.buildings || []).filter(inChunk).forEach((object) => {
      hash = fnvUpdate(hash, object.x);
      hash = fnvUpdate(hash, object.y);
      hash = fnvUpdate(hash, object.stage || 0);
      hash = fnvUpdate(hash, object.variant || 0);
      hash = fnvAny(hash, String(object.zone ?? "") + String(object.state ?? ""));
      hash = fnvUpdate(hash, object.footprint?.w || 1);
      hash = fnvUpdate(hash, object.footprint?.h || 1);
    });
    (sceneObjects?.facilities || []).filter(inChunk).forEach((object) => {
      hash = fnvUpdate(hash, object.x);
      hash = fnvUpdate(hash, object.y);
      hash = fnvAny(hash, object.kind);
    });
    return hash.toString(16);
  }

  // --- block collectors: snapshot in, instance descriptors out ---------------

  function pushBlock(list, x, y, z, sx, sy, sz, color, tile = null, shape = "box") {
    list.push({ x, y, z, sx, sy, sz, r: color.r, g: color.g, b: color.b, a: color.a === undefined ? 1 : color.a, tile, shape });
  }

  // One geometry definition serves GPU instances and the offline 2D atlas.
  // Faces have outward winding, world-space vertices and top-origin UVs.
  function blockFaces(block) {
    const shape = block.shape || "box";
    let polygons;
    if (shape.startsWith("slope-")) {
      const mask = Number(shape.slice(6)) & 15;
      const points = [[-.5,.5 + ((mask & 9) ? 1 : 0),-.5], [.5,.5 + ((mask & 3) ? 1 : 0),-.5], [.5,.5 + ((mask & 6) ? 1 : 0),.5], [-.5,.5 + ((mask & 12) ? 1 : 0),.5]];
      polygons = [[points[0],points[1],points[2]], [points[0],points[2],points[3]]];
      for (let i = 0; i < 4; i += 1) {
        const a = points[i], b = points[(i + 1) % 4];
        polygons.push([[a[0],-.5,a[2]],[b[0],-.5,b[2]],b,a]);
      }
      polygons.push([[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]);
    } else if (shape === "roof-x" || shape === "roof-z") {
      polygons = [
        [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,0],[-.5,.5,0]],
        [[-.5,.5,0],[.5,.5,0],[.5,-.5,.5],[-.5,-.5,.5]],
        [[-.5,-.5,.5],[.5,-.5,.5],[.5,-.5,-.5],[-.5,-.5,-.5]],
        [[-.5,-.5,-.5],[-.5,.5,0],[-.5,-.5,.5]],
        [[.5,-.5,.5],[.5,.5,0],[.5,-.5,-.5]],
      ];
      if (shape === "roof-z") polygons = polygons.map((face) => face.map(([x,y,z]) => [-z,y,x]));
    } else if (shape === "hip") {
      const base = [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]];
      polygons = base.map((point, i) => [point, base[(i + 1) % 4], [0,.5,0]]);
      polygons.push([...base].reverse());
    } else if (shape === "canopy" || shape === "conifer") {
      const ring = (y, r) => Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * r, y, Math.sin(i * Math.PI / 4) * r]);
      const rings = shape === "canopy" ? [ring(-.5,.22), ring(-.18,.5), ring(.23,.43), ring(.5,.16)] : [ring(-.5,.5), ring(.5,.015)];
      polygons = [];
      for (let j = 0; j < rings.length - 1; j += 1) {
        for (let i = 0; i < 8; i += 1) polygons.push([rings[j][i], rings[j][(i + 1) % 8], rings[j + 1][(i + 1) % 8], rings[j + 1][i]]);
      }
      polygons.push([...rings[0]].reverse(), rings[rings.length - 1]);
    } else {
      polygons = [
        [[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]],
        [[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]],
        [[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]],
        [[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]],
        [[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]],
        [[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]],
      ];
    }
    return polygons.map((points) => {
      const centroid = points.reduce((sum, p) => sum.map((v, i) => v + p[i] / points.length), [0,0,0]);
      const cross = (p) => {
        const a = p[1].map((v,i) => v - p[0][i]), b = p[2].map((v,i) => v - p[0][i]);
        return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
      };
      let normal = cross(points);
      if (normal.reduce((sum,v,i) => sum + v * centroid[i], 0) < 0) { points = [...points].reverse(); normal = cross(points); }
      normal = normal.map((v,i) => v / [block.sx,block.sy,block.sz][i]);
      const length = Math.hypot(...normal) || 1;
      normal = normal.map((v) => v / length);
      const top = normal[1] > .35;
      const xFace = Math.abs(normal[0]) > Math.abs(normal[2]);
      return {
        vertices: points.map(([x,y,z]) => [block.x + x * block.sx, block.y + y * block.sy, block.z + z * block.sz]),
        normal,
        uv: points.map(([x,y,z]) => top ? [x + .5,z + .5] : [xFace ? z + .5 : x + .5,.5 - y]),
        surface: top ? "top" : "side",
      };
    });
  }

  // Continuous path decorations: a center strip (road divider), twin rails,
  // a pipe ridge, or a wire run — one half-strip per connected neighbour, so
  // straight runs meet at tile edges, corners join at the tile centre, and
  // T/cross junctions overlap into a pad. Nothing here depends on the tile's
  // own texture, which stays a seamless base.
  function pushPathStrip(list, cx, topY, cz, mask, color, width, height, tile = null) {
    const reach = 0.5 - width / 2;
    pushBlock(list, cx, topY, cz, width, height, width, color, tile);
    for (const [bit, dx, dz] of [[1,0,-1],[2,1,0],[4,0,1],[8,-1,0]]) {
      if (!(mask & bit)) continue;
      const offset = width / 2 + reach / 2;
      pushBlock(list, cx + dx * offset, topY, cz + dz * offset,
        dx ? reach : width, height, dz ? reach : width, color, tile);
    }
  }

  function pushTwinRails(list, cx, topY, cz, mask, color, tile = null) {
    const railHalf = 0.045;
    const railH = 0.03;
    if (mask & (1 | 4)) {
      pushBlock(list, cx - 0.24, topY, cz - 0.25, railHalf, railH, 0.5, color, tile);
      pushBlock(list, cx + 0.24, topY, cz - 0.25, railHalf, railH, 0.5, color, tile);
    }
    if (mask & (2 | 8)) {
      pushBlock(list, cx - 0.25, topY, cz - 0.24, 0.5, railH, railHalf, color, tile);
      pushBlock(list, cx - 0.25, topY, cz + 0.24, 0.5, railH, railHalf, color, tile);
    }
  }

  // Bridges over water keep their run continuous and add guard rails along
  // both edges of each straight arm.
  function pushBridgeGuards(list, cx, topY, cz, mask) {
    const guardW = 0.045;
    const guardH = 0.12;
    const guardColor = { r: 0.58, g: 0.58, b: 0.52, a: 1 };
    if (mask & (1 | 4)) {
      pushBlock(list, cx - 0.44, topY + 0.06, cz - 0.25, guardW, guardH, 0.5, guardColor, "metal");
      pushBlock(list, cx + 0.44, topY + 0.06, cz - 0.25, guardW, guardH, 0.5, guardColor, "metal");
    }
    if (mask & (2 | 8)) {
      pushBlock(list, cx - 0.25, topY + 0.06, cz - 0.44, 0.5, guardH, guardW, guardColor, "metal");
      pushBlock(list, cx - 0.25, topY + 0.06, cz + 0.44, 0.5, guardH, guardW, guardColor, "metal");
    }
  }

  // A dark portal frame at each end of a road bore where it meets open air.
  function pushTunnelPortals(list, cx, topY, cz, tunnelMask, snapshot, x, y, size) {
    const frameColor = { r: 0.1, g: 0.1, b: 0.1, a: 1 };
    if ((tunnelMask & 1) && !isTunnel(snapshot, (y - 1) * size + x)) {
      pushBlock(list, cx, topY + 0.05, cz - 0.47, 1, 0.1, 0.06, frameColor, "tunnel");
    }
    if ((tunnelMask & 4) && !isTunnel(snapshot, (y + 1) * size + x)) {
      pushBlock(list, cx, topY + 0.05, cz + 0.47, 1, 0.1, 0.06, frameColor, "tunnel");
    }
    if ((tunnelMask & 2) && !isTunnel(snapshot, y * size + x + 1)) {
      pushBlock(list, cx + 0.47, topY + 0.05, cz, 0.06, 0.1, 1, frameColor, "tunnel");
    }
    if ((tunnelMask & 8) && !isTunnel(snapshot, y * size + x - 1)) {
      pushBlock(list, cx - 0.47, topY + 0.05, cz, 0.06, 0.1, 1, frameColor, "tunnel");
    }
  }

  // SC2000 mountain signature: where a water tile meets land at least two
  // altitude levels higher, the shared edge is a waterfall. Pure renderer
  // derivation — the simulation state never changes for a visual.
  function waterfallEdges(snapshot) {
    const size = mapSize(snapshot);
    const edges = [];
    const waterAt = (x, y) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return false;
      const index = y * size + x;
      return Boolean(gridValue(snapshot, ["water"], index, false))
        || String(gridValue(snapshot, ["terrainType", "terrain"], index, "")).toLowerCase() === "water";
    };
    const altitudeAtTile = (x, y) => (x >= 0 && y >= 0 && x < size && y < size ? altitudeAt(snapshot, y * size + x) : 0);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!waterAt(x, y)) continue;
        const waterAlt = altitudeAtTile(x, y);
        const neighbors = [[0, -1, "n"], [1, 0, "e"], [0, 1, "s"], [-1, 0, "w"]];
        for (const [dx, dy, dir] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (waterAt(nx, ny)) continue;
          const drop = altitudeAtTile(nx, ny) - waterAlt;
          if (drop >= 2) edges.push({ x, y, dir, height: Math.min(6, drop) });
        }
      }
    }
    return edges;
  }

  // SC2000 stepped-terrain depth: every lower land tile that borders a
  // higher tile casts a shadow band along that shared edge. Pure renderer
  // derivation; returns [{ x, y, dir, drop }] on the lower tile.
  function cliffEdges(snapshot) {
    const size = mapSize(snapshot);
    const edges = [];
    const neighbors = [[0, -1, "n"], [1, 0, "e"], [0, 1, "s"], [-1, 0, "w"]];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        if (gridValue(snapshot, ["water"], index, false)) continue;
        const alt = altitudeAt(snapshot, index);
        for (const [dx, dy, dir] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const drop = altitudeAt(snapshot, ny * size + nx) - alt;
          if (drop >= 1) edges.push({ x, y, dir, drop: Math.min(6, drop) });
        }
      }
    }
    return edges;
  }

  // Roads read as paved corridors: a low curb along each edge of every
  // connected arm, continuous across tile boundaries like the center strip.
  function pushRoadCurbs(list, cx, topY, cz, mask) {
    const color = { r: 0.62, g: 0.62, b: 0.58, a: 1 };
    for (const [bit, dx, dz] of [[1,0,-1],[2,1,0],[4,0,1],[8,-1,0]]) {
      if (!(mask & bit)) continue;
      for (const side of [-1,1]) pushBlock(list,
        cx + dx * 0.39 + dz * side * 0.3, topY + 0.038,
        cz + dz * 0.39 + dx * side * 0.3,
        dx ? 0.22 : 0.035, 0.025, dz ? 0.22 : 0.035, color, "concrete");
    }
  }

  // Civic landmarks get real voxel silhouettes instead of generic boxes:
  // domes, towers, chimneys, stadium tiers, cranes, and shoreline slabs —
  // the SimCity 2000 habit of making every landmark readable at a glance.
  // Utility plants have equipment silhouettes rather than generic wall masses.
  // All dimensions are footprint-relative; night changes paint, never geometry.
  function pushUtilityFacility(opaque, facility, cx, cz, topY, footprint, recipe, recipes, night) {
    const kind = facility.kind;
    if (!["wind", "solar", "hydro", "tower", "pump", "microwave", "fusion"].includes(kind)) return false;
    const w = footprint.w;
    const d = footprint.h;
    const unit = Math.min(w, d);
    const paint = (hex) => shade(hexColor(hex), night ? 0.68 : 1);
    const concrete = paint("#9b9b8d");
    const metal = paint("#89979a");
    const pale = paint("#b6b8a8");
    const dark = paint("#47595b");
    const blue = paint("#3e6271");
    const brick = paint("#98705b");
    const block = (x, y, z, sx, sy, sz, color, tile = "metal", shape = "box") => {
      pushBlock(opaque, cx + x * w, topY + y * unit, cz + z * d,
        sx * w, sy * unit, sz * d, color, tile, shape);
    };
    block(0, 0.025, 0, 0.94, 0.05, 0.94, concrete, "concrete");
    if (kind === "solar") {
      // Sixteen individually supported modules, not a solid blue building.
      for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
        const x = -0.33 + column * 0.22;
        const z = -0.33 + row * 0.22;
        block(x, 0.075, z, 0.045, 0.05, 0.045, dark);
        block(x, 0.115, z, 0.19, 0.05, 0.18, blue, "facility.solar", "roof-z");
      }
      return true;
    }
    if (kind === "wind") {
      block(0, 0.49, 0, 0.075, 0.88, 0.075, pale);
      block(0, 0.96, 0, 0.17, 0.13, 0.24, metal);
      // Three fixed blades in the vertical XY plane; the short segments
      // preserve the three-arm silhouette without new rotation attributes.
      for (let blade = 0; blade < 3; blade += 1) {
        const angle = -Math.PI / 2 + blade * Math.PI * 2 / 3;
        for (let segment = 0; segment < 7; segment += 1) {
          const radius = 0.08 + segment * 0.048;
          block(Math.cos(angle) * radius, 0.96 + Math.sin(angle) * radius, -0.15,
            0.065 - segment * 0.003, 0.065 - segment * 0.003, 0.034, pale);
        }
      }
      block(0, 0.96, -0.16, 0.11, 0.11, 0.07, dark, "metal", "canopy");
      return true;
    }
    if (kind === "tower") {
      for (const x of [-0.22, 0.22]) for (const z of [-0.22, 0.22]) block(x, 0.37, z, 0.06, 0.64, 0.06, metal);
      block(0, 0.5, 0, 0.53, 0.045, 0.53, dark);
      block(0, 0.79, 0, 0.71, 0.5, 0.71, pale, "metal", "canopy");
      block(0, 1.045, 0, 0.14, 0.05, 0.14, dark);
      // Exterior riser reaches the tank from the slab.
      block(0.16, 0.37, 0.12, 0.035, 0.64, 0.035, blue, "pipe");
      return true;
    }
    if (kind === "pump") {
      block(-0.14, 0.19, 0.02, 0.48, 0.28, 0.54, brick, "concrete");
      block(-0.14, 0.35, 0.02, 0.52, 0.08, 0.58, dark, "roof.dark", "roof-x");
      block(-0.14, 0.14, -0.256, 0.15, 0.18, 0.025, dark);
      for (const z of [-0.23, 0.23]) {
        block(0.26, 0.09, z, 0.13, 0.08, 0.13, concrete, "concrete");
        block(0.26, 0.19, z, 0.075, 0.18, 0.075, blue, "pipe");
        block(0.13, 0.265, z, 0.3, 0.07, 0.07, blue, "pipe");
        block(0.26, 0.25, z, 0.13, 0.035, 0.13, dark, "metal", "canopy");
      }
      return true;
    }
    if (kind === "hydro") {
      block(0, 0.31, 0.06, 0.86, 0.52, 0.3, concrete, "concrete");
      block(0, 0.595, 0.06, 0.9, 0.05, 0.34, pale, "concrete");
      for (const x of [-0.3, 0, 0.3]) {
        block(x, 0.3, 0.28, 0.09, 0.5, 0.21, concrete, "concrete", "roof-z");
        block(x, 0.3, -0.099, 0.16, 0.36, 0.025, dark);
        block(x, 0.51, -0.12, 0.21, 0.07, 0.08, metal);
      }
      block(0.3, 0.68, 0.08, 0.18, 0.12, 0.19, brick, "concrete");
      return true;
    }
    if (kind === "microwave") {
      block(-0.15, 0.18, 0.19, 0.43, 0.26, 0.35, concrete, "concrete");
      block(-0.15, 0.325, 0.19, 0.47, 0.03, 0.39, dark, "roof.deck");
      block(0.11, 0.48, -0.08, 0.075, 0.86, 0.075, metal);
      block(0.11, 0.8, -0.11, 0.55, 0.55, 0.18, pale, "metal", "canopy");
      block(0.11, 0.8, -0.205, 0.43, 0.43, 0.025, dark, "metal", "canopy");
      block(0.11, 0.8, -0.245, 0.04, 0.04, 0.075, metal);
      return true;
    }
    // A faceted circular reactor hall surrounded by an equipment ring.
    for (let segment = 0; segment < 12; segment += 1) {
      const angle = segment * Math.PI * 2 / 12;
      const x = Math.cos(angle) * 0.29;
      const z = Math.sin(angle) * 0.29;
      block(x, 0.21, z, 0.15, 0.32, 0.15, concrete, "concrete");
      block(x, 0.385, z, 0.17, 0.03, 0.17, dark);
    }
    block(0, 0.31, 0, 0.52, 0.5, 0.52, pale, "metal", "canopy");
    block(0, 0.58, 0, 0.09, 0.06, 0.09, blue);
    block(-0.27, 0.14, 0.35, 0.28, 0.18, 0.16, brick, "concrete");
    return true;
  }

  // Civic/service facilities retain windows and equipment-specific silhouettes.
  function pushServiceFacility(opaque, facility, cx, cz, topY, footprint, recipe, recipes, night) {
    const kind = facility.kind;
    if (!["coal", "oil", "gas", "nuclear", "treatment", "desal", "police", "fire", "school", "clinic", "station", "bus", "subway-station"].includes(kind)) return false;
    const w = footprint.w;
    const d = footprint.h;
    const unit = Math.min(w, d);
    const ink = (hex) => shade(hexColor(hex), night ? 0.7 : 1);
    const stone = ink("#a49b86"); const metal = ink("#8b9899");
    const dark = ink("#495d62"); const red = ink("#aa5949");
    const blue = ink("#527888"); const concrete = ink("#92968a");
    const wall = `wall.${["fire", "school"].includes(kind) ? "r" : "c"}.${night ? "night" : "day"}`;
    const block = (x, y, z, sx, sy, sz, color, tile = "metal", shape = "box") =>
      pushBlock(opaque, cx + x * w, topY + y * unit, cz + z * d,
        sx * w, sy * unit, sz * d, color, tile, shape);
    const room = (x, z, sx, sz, height = 0.32, color = stone) => {
      block(x, 0.05 + height / 2, z, sx, height, sz, color, wall);
      block(x, 0.065 + height, z, sx + 0.025, 0.03, sz + 0.025, dark, "roof.deck");
    };
    const chimney = (x, z, height = 0.68) => {
      block(x, 0.05 + height / 2, z, 0.085, height, 0.085, stone, "concrete");
      block(x, height, z, 0.095, 0.04, 0.095, red);
      block(x, height + 0.045, z, 0.09, 0.045, 0.09, dark);
    };
    const tank = (x, z, radius = 0.14, height = 0.25) => {
      block(x, 0.05 + height / 2, z, radius * 2, height, radius * 2, metal, "metal", "canopy");
      block(x, 0.06 + height, z, radius * 0.45, 0.025, radius * 0.45, dark);
    };
    block(0, 0.025, 0, 0.94, 0.05, 0.94, concrete, "concrete");
    if (kind === "police") {
      room(-0.19, 0.06, 0.33, 0.64, 0.42);
      room(0.16, 0.26, 0.33, 0.23, 0.3);
      block(0.19, 0.058, -0.12, 0.34, 0.016, 0.35, concrete, "park");
      block(-0.19, 0.63, 0.22, 0.022, 0.3, 0.022, metal);
      block(-0.19, 0.7, 0.22, 0.13, 0.018, 0.018, metal);
      block(-0.19, 0.22, -0.272, 0.13, 0.13, 0.025, blue, "metal", "canopy");
      return true;
    }
    if (kind === "fire") {
      room(-0.25, 0.07, 0.28, 0.58, 0.45, red);
      room(0.13, 0.07, 0.43, 0.58, 0.28, red);
      for (const x of [-0.015, 0.135, 0.285]) {
        block(x, 0.155, -0.232, 0.115, 0.21, 0.022, dark);
        block(x, 0.21, -0.249, 0.09, 0.06, 0.012, blue);
      }
      block(-0.25, 0.62, 0.19, 0.12, 0.18, 0.12, stone, wall);
      block(-0.25, 0.73, 0.19, 0.15, 0.04, 0.15, dark, "roof.dark", "hip");
      return true;
    }
    if (kind === "school") {
      room(-0.28, 0, 0.22, 0.7, 0.29);
      room(0.28, 0, 0.22, 0.7, 0.29);
      room(0, 0.25, 0.36, 0.2, 0.35);
      block(0, 0.06, -0.08, 0.3, 0.02, 0.38, blue, "park");
      block(0, 0.075, -0.08, 0.28, 0.01, 0.018, stone);
      block(-0.1, 0.12, -0.24, 0.013, 0.12, 0.013, metal);
      block(0.1, 0.12, 0.06, 0.013, 0.12, 0.013, metal);
      return true;
    }
    if (kind === "clinic") {
      room(0, 0.11, 0.67, 0.51, 0.43);
      room(0, -0.23, 0.3, 0.17, 0.22);
      block(0, 0.518, 0.11, 0.22, 0.018, 0.07, red);
      block(0, 0.518, 0.11, 0.07, 0.018, 0.22, red);
      block(0, 0.17, -0.324, 0.15, 0.14, 0.015, blue);
      return true;
    }
    if (["station", "bus", "subway-station"].includes(kind)) {
      if (kind === "subway-station") {
        room(0.19, 0.16, 0.28, 0.33, 0.23);
        for (let n = 0; n < 5; n += 1) block(-0.13, 0.07 + n * 0.012, -0.29 + n * 0.055, 0.23, 0.04, 0.05, dark, "concrete");
        for (const x of [-0.3, 0.035]) block(x, 0.16, -0.18, 0.018, 0.22, 0.33, metal);
        block(-0.13, 0.36, -0.035, 0.37, 0.08, 0.15, blue, "roof.dark", "roof-x");
        return true;
      }
      block(0, 0.085, 0.07, 0.86, 0.07, 0.35, stone, "concrete");
      for (const x of [-0.33, 0, 0.33]) for (const z of [-0.05, 0.19]) block(x, 0.24, z, 0.025, 0.27, 0.025, metal);
      block(0, 0.4, 0.07, 0.86, 0.07, 0.41, dark, "roof.dark", "roof-x");
      if (kind === "station") {
        for (const z of [-0.28, -0.39]) block(0, 0.07, z, 0.88, 0.035, 0.023, metal, "rail");
        for (let n = 0; n < 8; n += 1) block(-0.39 + n * 0.11, 0.055, -0.335, 0.04, 0.01, 0.19, dark);
      } else {
        for (const x of [-0.23, 0.23]) {
          block(x, 0.13, -0.29, 0.32, 0.12, 0.16, red);
          block(x, 0.21, -0.29, 0.28, 0.07, 0.14, blue);
          for (const dx of [-0.1, 0.1]) block(x + dx, 0.065, -0.29, 0.06, 0.04, 0.18, dark);
        }
      }
      return true;
    }
    if (kind === "treatment") {
      room(0, 0.31, 0.73, 0.16, 0.2);
      for (const x of [-0.22, 0.22]) for (const z of [-0.23, 0.09]) {
        block(x, 0.1, z, 0.3, 0.1, 0.25, stone, "concrete");
        block(x, 0.157, z, 0.25, 0.015, 0.2, blue, "metal");
        block(x, 0.18, z, 0.018, 0.028, 0.25, metal);
      }
      return true;
    }
    if (kind === "desal") {
      room(-0.24, 0.08, 0.26, 0.63, 0.24);
      for (const x of [0.07, 0.28]) for (const z of [-0.2, 0.17]) tank(x, z, 0.085, 0.25);
      for (const z of [-0.2, 0.17]) block(0.085, 0.11, z, 0.45, 0.055, 0.045, blue, "pipe");
      block(0.32, 0.11, -0.015, 0.045, 0.055, 0.42, blue, "pipe");
      return true;
    }
    room(-0.18, 0.05, 0.4, 0.65, kind === "gas" ? 0.29 : 0.43);
    if (kind === "nuclear") {
      for (const z of [-0.22, 0.21]) {
        block(0.23, 0.12, z, 0.31, 0.14, 0.3, stone, "concrete", "canopy");
        block(0.23, 0.3, z, 0.18, 0.28, 0.18, stone, "concrete");
        block(0.23, 0.45, z, 0.32, 0.12, 0.3, stone, "concrete", "canopy");
        block(0.23, 0.514, z, 0.17, 0.012, 0.16, dark);
      }
    } else if (kind === "oil") {
      for (const z of [-0.22, 0.2]) tank(0.2, z, 0.16, 0.32);
      chimney(-0.25, 0.19, 0.73);
    } else if (kind === "gas") {
      for (const z of [-0.2, 0.19]) {
        block(0.22, 0.18, z, 0.29, 0.25, 0.22, metal, "metal", "canopy");
        block(0.21, 0.35, z, 0.25, 0.07, 0.09, blue, "pipe");
      }
      chimney(-0.26, 0.2, 0.57);
    } else {
      chimney(0.15, 0.22, 0.8);
      chimney(0.32, 0.22, 0.67);
      block(0.23, 0.12, -0.18, 0.32, 0.14, 0.3, dark, "terrain.rock", "canopy");
      block(-0.18, 0.52, 0.05, 0.26, 0.08, 0.46, metal, "roof.dark", "roof-x");
    }
    return true;
  }

  function pushCatalogObject(opaque, tile, cx, cz, topY, recipe, fallbackColor) {
    const label = tile.label;
    const footprint = normalizeFootprint(tile.footprint || [1, 1]);
    const w = footprint.w, d = footprint.h;
    const h = Math.max(0.22, recipe ? pxToWorld(recipe.height * PX_PER_TILE) : 0.55);
    const night = Boolean(tile.night);
    const original = recipe ? recipe.base : fallbackColor;
    const stone = { r: 0.83, g: 0.8, b: 0.72, a: 1 };
    const base = { r: original.r * 0.45 + stone.r * 0.55, g: original.g * 0.45 + stone.g * 0.55, b: original.b * 0.45 + stone.b * 0.55, a: 1 };
    const white = { r: 0.9, g: 0.91, b: 0.87, a: 1 };
    const steel = { r: 0.5, g: 0.55, b: 0.57, a: 1 };
    const roof = { r: 0.4, g: 0.43, b: 0.43, a: 1 };
    const grass = { r: 0.6, g: 0.73, b: 0.48, a: 1 };
    const water = { r: 0.42, g: 0.65, b: 0.78, a: 1 };
    const wall = `wall.c.${night ? "night" : "day"}`;
    const residential = `wall.r.${night ? "night" : "day"}`;
    // x/z and width/depth are footprint fractions; y/height are world units.
    const box = (x, y, z, sx, sy, sz, color = base, material = "concrete", shape = "box") => {
      pushBlock(opaque, cx + x * w, topY + y, cz + z * d, sx * w, sy, sz * d, color, material, shape);
    };
    const building = (x, z, sx, sz, height = h * 0.55, material = wall) => {
      box(x, height / 2 + 0.04, z, sx, height, sz, night ? shade(base, 0.65) : base, material);
      box(x, height + 0.065, z, sx + 0.018, 0.05, sz + 0.018, roof, "roof.deck");
    };
    const tree = (x, z, scale = 1) => {
      box(x, 0.13 * scale, z, 0.025, 0.26 * scale, 0.025, base, "tree.trunk");
      box(x, 0.36 * scale, z, 0.15, 0.38 * scale, 0.15, grass, "tree.canopy", "canopy");
    };
    const lamp = (x, z, height = 0.6) => {
      box(x, height / 2, z, 0.016, height, 0.016, steel, "metal");
      box(x, height, z, 0.055, 0.035, 0.04, white, night ? "wall.c.night" : "metal");
    };
    const ground = (material = "concrete", color = stone) => box(0, 0.02, 0, 0.96, 0.04, 0.96, color, material);

    if (label === "stadium") {
      ground("park", grass);
      box(0, 0.046, 0, 0.46, 0.012, 0.62, grass, "park");
      // Four independent banks leave the playing field open to the sky.
      for (let tier = 0; tier < 4; tier += 1) {
        const offset = 0.27 + tier * 0.047, rise = 0.075 + tier * 0.065;
        box(-offset, rise, 0, 0.048, 0.09, 0.78, stone, "concrete");
        box(offset, rise, 0, 0.048, 0.09, 0.78, stone, "concrete");
        box(0, rise, -offset, 0.54, 0.09, 0.048, base, "concrete");
        box(0, rise, offset, 0.54, 0.09, 0.048, base, "concrete");
      }
      box(0, 0.058, 0, 0.006, 0.01, 0.6, white, "concrete");
      for (const z of [-0.29, 0.29]) {
        box(0, 0.059, z, 0.44, 0.012, 0.006, white, "concrete");
        box(0, 0.11, z, 0.12, 0.1, 0.014, white, "metal");
      }
      for (const x of [-0.43, 0.43]) for (const z of [-0.43, 0.43]) lamp(x, z, 0.75);
      return;
    }
    if (label === "park_big" || label === "zoo") {
      ground("park", grass);
      box(0, 0.048, 0, 0.08, 0.015, 0.9, stone, "terrain.sand");
      box(0, 0.05, 0, 0.9, 0.016, 0.065, stone, "terrain.sand");
      for (const [x,z] of [[-.3,-.3],[-.29,.28],[.31,-.27],[.32,.3]]) tree(x,z);
      if (label === "zoo") {
        building(-.22, .3, .2, .2, .24, residential);
        for (const z of [-.4,.06]) box(.22,.11,z,.36,.13,.014,steel,"metal");
        for (const x of [.04,.4]) box(x,.11,-.17,.014,.13,.46,steel,"metal");
        box(.24,.055,-.2,.18,.02,.23,water,"water");
      } else {
        box(0,.09,0,.22,.13,.22,stone,"concrete");
        box(0,.17,0,.17,.035,.17,water,"water");
        box(0,.25,0,.025,.17,.025,white,"metal");
      }
      return;
    }
    if (label === "marina" || label === "pier") {
      // Actual finger piers, mooring poles and two compact sailing boats.
      box(0,.08,0,.13,.1,.94,base,"tree.trunk");
      for (const z of [-.31,.26]) {
        box(.14,.08,z,.5,.1,.1,base,"tree.trunk");
        for (const x of [-.04,.34]) box(x,.07,z,.035,.13,.035,steel,"metal");
        box(-.23,.08,z,.15,.13,.29,white,"metal","hip");
        box(-.23,.18,z,.07,.08,.13,base,"roof.deck");
        box(-.23,.36,z,.012,.48,.012,steel,"metal");
        box(-.2,.41,z,.07,.24,.015,white,"concrete","roof-z");
      }
      if (label === "marina") building(.28,-.32,.22,.2,.25,residential);
      return;
    }
    if (label === "runway" || label === "tarmac") {
      ground(label === "runway" ? "road" : "concrete", label === "runway" ? roof : stone);
      for (const z of [-.35,0,.35]) box(0,.046,z,.035,.012,.15,white,"concrete");
      if (label === "tarmac") box(.2,.047,0,.014,.012,.65,white,"concrete");
      return;
    }
    if (label === "church") {
      ground();
      building(0,.08,.43,.7,h*.45,residential);
      box(0,h*.45+.17,.08,.49,.27,.75,roof,"roof","roof-z");
      building(0,-.27,.28,.23,h*.88,residential);
      box(0,h*.88+.19,-.27,.33,.28,.29,roof,"roof.deck","hip");
      box(0,h*.88+.39,-.27,.018,.22,.018,white,"metal");
      box(0,h*.88+.43,-.27,.14,.022,.018,white,"metal");
      return;
    }
    if (label === "city_hall" || label === "museum" || label === "library") {
      ground();
      building(0,-.09,.77,.51,h*.54,residential);
      box(0,.1,.28,.58,.14,.23,stone,"concrete");
      for (const x of [-.24,-.12,0,.12,.24]) box(x,h*.25,.31,.035,h*.4,.035,white,"concrete");
      box(0,h*.47,.3,.62,.07,.22,stone,"concrete");
      box(0,h*.56,.3,.65,.14,.23,roof,"roof","roof-x");
      if (label === "city_hall") {
        building(0,-.08,.19,.2,h*.92,residential);
        box(0,h*.97,-.08,.25,.15,.25,roof,"roof.deck","hip");
        box(0,h*.81,.025,.07,.08,.014,white,"metal");
      } else if (label === "museum") box(0,h*.64,-.1,.23,.25,.23,stone,"concrete","canopy");
      else box(.28,h*.59,-.08,.13,.09,.34,white,"roof.deck");
      return;
    }
    if (label === "mayors_house") {
      ground("park",grass);
      building(-.06,-.08,.53,.51,h*.56,residential);
      box(-.06,h*.56+.17,-.08,.59,.25,.57,roof,"roof","hip");
      building(.31,.02,.18,.31,h*.3,residential);
      box(-.06,.052,.34,.12,.015,.25,stone,"concrete");
      tree(-.35,.3); tree(.34,-.33);
      return;
    }
    if (label === "hospital" || label === "college" || label === "service" || label === "prison") {
      ground();
      building(0,-.25,.77,.25,h*.73);
      building(-.28,.03,.23,.46,h*.57);
      building(.28,.03,.23,.46,h*.57);
      if (label === "hospital") {
        box(0,h*.8,-.25,.1,.07,.22,white,"concrete");
        box(0,h*.8,-.25,.23,.07,.08,white,"concrete");
        box(0,.05,.3,.45,.018,.24,roof,"road");
      } else if (label === "prison") {
        for (const z of [-.45,.45]) box(0,.22,z,.92,.36,.025,stone,"concrete");
        for (const x of [-.45,.45]) { box(x,.22,0,.025,.36,.92,stone,"concrete"); building(x*.97,.4,.1,.1,h*.87); }
      } else { box(0,.049,.1,.23,.016,.28,grass,"park"); tree(0,.2,.8); }
      return;
    }
    if (label === "dome") {
      ground();
      box(0,h*.18,0,.85,h*.32,.85,base,wall);
      box(0,h*.53,0,.86,h*.56,.86,white,wall,"canopy");
      building(0,.38,.22,.17,.25);
      return;
    }
    if (label === "arcology") {
      ground("park",grass);
      building(0,0,.8,.8,h*.18);
      for (const x of [-.24,.24]) for (const z of [-.24,.24]) building(x,z,.25,.25,h*.82);
      box(0,h*.61,0,.7,.14,.2,base,wall);
      box(0,h*.76,0,.2,.14,.7,base,wall);
      box(0,h*.23,0,.19,.12,.19,grass,"tree.canopy","canopy");
      return;
    }
    if (label === "control_tower") {
      ground();
      building(0,0,.18,.2,h*.76,residential);
      box(0,h*.85,0,.45,h*.22,.44,white,wall);
      box(0,h*.99,0,.49,.055,.48,roof,"roof.deck");
      box(0,h*1.1,0,.018,.2,.018,steel,"metal");
      return;
    }
    if (label === "crane") {
      for (const x of [-.27,.27]) box(x,h*.36,0,.07,h*.7,.1,steel,"metal");
      box(0,h*.72,0,.75,.095,.13,base,"metal");
      box(.15,h*.49,0,.02,h*.44,.02,steel,"wire");
      box(.15,h*.25,0,.09,.09,.08,steel,"metal");
      box(-.23,h*.75,0,.14,.2,.19,white,wall);
      return;
    }
    if (label === "water_treatment" || label === "desalination") {
      ground();
      building(-.29,0,.26,.67,h*.5,`wall.i.${night ? "night" : "day"}`);
      for (const z of [-.23,.23]) {
        box(.16,.14,z,.43,.2,.34,stone,"concrete");
        box(.16,.255,z,.36,.025,.27,water,"water");
        box(.16,.28,z,.025,.025,.33,steel,"pipe");
      }
      return;
    }
    if (label === "power_plant" || label === "solar") {
      ground();
      if (label === "solar") {
        for (const x of [-.3,0,.3]) for (const z of [-.3,0,.3]) {
          box(x,.09,z,.045,.13,.035,steel,"metal");
          box(x,.18,z,.25,.025,.24,water,"wall.c.day");
        }
      } else {
        building(-.12,0,.57,.76,h*.5,`wall.i.${night ? "night" : "day"}`);
        for (const z of [-.23,.2]) {
          box(.31,h*.55,z,.1,h*1.02,.1,stone,"concrete");
          box(.31,h*.97,z,.105,.08,.105,base,"metal");
        }
        box(-.12,h*.59,0,.59,.13,.8,roof,"roof","roof-z");
      }
      return;
    }
    if (label === "bus_depot" || label === "subway_station") {
      ground();
      building(-.19,-.03,.38,.71,h*.63);
      for (const z of [-.23,.18]) {
        box(.2,.12,z,.37,.17,.14,white,"metal");
        box(.21,.22,z,.25,.065,.11,water,wall);
      }
      if (label === "subway_station") box(.2,.055,0,.23,.025,.48,roof,"tunnel");
      return;
    }
    if (label === "missile_silo") {
      ground("terrain.grass",grass);
      box(0,.09,0,.64,.14,.64,stone,"concrete");
      box(0,.17,0,.53,.035,.53,steel,"metal","canopy");
      building(.32,-.32,.18,.18,.22,residential);
      return;
    }
    if (label === "statue") {
      ground();
      box(0,.13,0,.42,.22,.42,stone,"concrete");
      box(0,h*.44,0,.15,h*.48,.14,base,"metal");
      box(0,h*.75,0,.13,.14,.13,base,"metal","canopy");
      box(-.08,h*.49,0,.28,.08,.075,base,"metal");
      return;
    }
    if (["rubble","radioactive","construction","abandoned"].includes(label)) {
      ground("terrain.soil",base);
      if (label === "abandoned") { building(-.12,0,.55,.67,h*.72,"abandoned"); box(.28,h*.25,-.2,.12,h*.5,.14,base,"abandoned"); }
      else if (label === "construction") {
        for (const x of [-.31,.31]) for (const z of [-.3,.3]) box(x,h*.55,z,.045,h,.045,steel,"metal");
        box(0,h*.6,0,.68,.055,.65,base,"construction");
        box(0,h*.95,0,.68,.045,.65,steel,"metal");
      } else for (let i=0;i<6;i+=1) box((i%3-.9)*.23,.075+(i%2)*.025,(Math.floor(i/3)-.5)*.37,.17,.12+(i%2)*.05,.21,label === "radioactive" ? grass : base,"terrain.rock","hip");
      return;
    }
    // Infrastructure switchyard: transformers, fenced pad and two gantries.
    ground();
    for (const x of [-.24,.24]) {
      box(x,.2,0,.21,.31,.42,steel,"metal");
      box(x,.45,0,.04,.18,.035,stone,"concrete");
    }
    for (const z of [-.35,.35]) box(0,.56,z,.78,.035,.035,steel,"wire");
  }

  // --- building grammar: the 2D composer's vocabulary as blocks -------------
  //
  // The Canvas atlas composes every building from massing, roof form, roof
  // furniture and a facade treatment (tooling/build-bonsai-atlas.mjs). The
  // voxel backend reads the same grammar from atlas-source.json and turns
  // each part into blocks, so both backends show the same silhouettes.
  // Grammar heights are 2D screen pixels; one world unit projects to
  // PX_PER_WORLD_Y pixels at zoom 1, and thresholds stay in pixels so both
  // backends choose the same form for the same variant.
  const PX_PER_WORLD_Y = (PX_PER_TILE / Math.SQRT2) * COS_ELEVATION;
  // Storey bands per wall texture tile: the wall tiles carry one storey per
  // row, so a one-unit wall block shows whole floors.
  const WALL_ROWS = Object.freeze({ r: 3, c: 3, i: 2 });
  const ZONE_NAMES = Object.freeze({ r: "residential", c: "commercial", i: "industrial" });

  function pxToWorld(px) {
    return (Number(px) || 0) / PX_PER_WORLD_Y;
  }

  function grammarForZone(recipes, prefix, stage) {
    const byZone = recipes.grammar && recipes.grammar[ZONE_NAMES[prefix]];
    if (!byZone || typeof byZone !== "object") return null;
    return byZone[String(stage)] || byZone["2"] || null;
  }

  function grammarPalette(recipes) {
    const color = (name, fallback) => recipes.paletteColor(name, fallback);
    return {
      steel: color("steel", "metal"),
      brick: color("brick", "residential"),
      stack: color("stack", "concrete"),
      sign: color("sign", "yellow"),
      signCool: color("signCool", "commercial"),
      red: color("red"),
      metal: color("metal"),
      concrete: color("concrete"),
      black: color("black"),
      door: color("door", "black"),
      glassCool: color("glassCool", "glass"),
      awning: color("awning", "red"),
      awningAlt: color("awningAlt", "commercial"),
      roofDeck: color("roofDeck", "concrete"),
      construction: color("construction", "yellow"),
      roofDark: color("roofDark", "abandoned"),
      roofTile: color("roofTile", "residential"),
    };
  }

  // massesFor() from the 2D composer in tile units around the footprint
  // centre: u runs along x, v along z, y is world height. A variant picks
  // one form, so buildings of one stage do not share an outline.
  // Visual parcels use one physical scale. A lot is not a building envelope:
  // floor plates, front access, yards and setbacks are separate decisions.
  const TILE_METERS = 16;

  function rectangleUnionArea(rectangles) {
    const xs = [...new Set(rectangles.flatMap((r) => [r.u0, r.u1]))].sort((a,b) => a-b);
    let area = 0;
    for (let n = 1; n < xs.length; n += 1) {
      const x = (xs[n-1] + xs[n]) / 2;
      const spans = rectangles.filter((r) => r.u0 < x && r.u1 > x).map((r) => [r.v0,r.v1]).sort((a,b) => a[0]-b[0]);
      let start = null, end = null, length = 0;
      for (const [a,b] of spans) {
        if (start === null) { start = a; end = b; }
        else if (a <= end) end = Math.max(end,b);
        else { length += end-start; start=a; end=b; }
      }
      if (start !== null) length += end-start;
      area += (xs[n]-xs[n-1])*length;
    }
    return area;
  }

  function measureParcelPlan(masses, footprint) {
    const lotArea = footprint.w * footprint.h;
    const floors = new Map();
    for (const mass of masses) for (let floor = 0; floor < mass.stories; floor += 1) {
      const key = Math.round((mass.y0 + floor * mass.storeyHeight) * 1e6);
      if (!floors.has(key)) floors.set(key,[]);
      floors.get(key).push(mass);
    }
    const coveredArea = rectangleUnionArea(masses);
    const floorArea = [...floors.values()].reduce((sum,plates) => sum + rectangleUnionArea(plates),0);
    return { lotAreaM2: lotArea*TILE_METERS*TILE_METERS, footprintM2: coveredArea*TILE_METERS*TILE_METERS,
      floorAreaM2: floorArea*TILE_METERS*TILE_METERS, coverage: coveredArea/lotArea, far: floorArea/lotArea,
      heightMeters: Math.max(...masses.map((m) => m.y1))*TILE_METERS,
      storeys: Math.max(...masses.map((m) => Math.round(m.y0/m.storeyHeight)+m.stories)) };
  }

  function plannedBuildingMasses(footprint, planning, variant) {
    const zone = planning.zone, stage = planning.stage;
    const forms = planning.forms;
    const form = forms[(variant-1)%forms.length];
    const count = planning.stories[0] + (Math.floor((variant-1)/forms.length)% (planning.stories[1]-planning.stories[0]+1));
    const masses = [];
    const add = (u0,v0,u1,v1,stories=count,usage="main",base=0,storeyMeters=planning.storeyMeters) => {
      const storeyHeight = storeyMeters/TILE_METERS;
      const mass = { u0:u0*footprint.w, v0:v0*footprint.h, u1:u1*footprint.w, v1:v1*footprint.h,
        y0:base*storeyHeight,y1:(base+stories)*storeyHeight,stories,storeyHeight,usage,
        roof: zone === "residential" && stage === 1 && usage === "main" ? "pitched" : usage === "hall" && variant%2 ? "sawtooth" : "flat" };
      masses.push(mass); return mass;
    };
    if (zone === "residential" && stage === 1) {
      if (form === "house-garage") {
        add(-.23,-.30,.34,.23); add(-.44,-.19,-.23,.18,1,"garage",0,2.8);
      } else if (form === "l-house") {
        add(-.32,-.31,.31,.09); add(-.32,.09,-.08,.32,Math.min(count,1));
      } else add(-.28,-.29,.28,.27);
    } else if (zone === "residential") {
      if (form === "twin-bars") {
        add(-.40,-.34,-.16,.34); add(.16,-.34,.40,.34);
      } else if (form === "open-court") {
        add(-.39,-.34,.39,-.12); add(-.39,-.12,-.19,.34); add(.19,-.12,.39,.34);
      } else if (form === "l-block") {
        add(-.38,-.34,.38,-.10); add(-.38,-.10,-.14,.40);
      } else if (form === "slab") add(-.32,-.25,.32,.25);
      else add(-.38,-.25,.38,.20);
    } else if (zone === "commercial") {
      if (form === "shop") add(-.39,-.26,.39,.38);
      else if (form === "corner-shop") { add(-.39,.00,.39,.38); add(-.39,-.34,-.03,.00); }
      else if (form === "shop-terrace") { add(-.40,-.27,-.04,.38, count, "shop", 0, planning.storeyMeters); add(-.01,-.27,.40,.38, Math.max(1,count-1), "shop", 0, planning.storeyMeters); }
      else if (form === "small-court") { add(-.39,-.35,.39,-.12); add(-.39,-.12,-.15,.38); add(.15,-.12,.39,.38); }
      else if (form === "main-street") add(-.38,-.24,.38,.39);
      else if (form === "open-court") {
        add(-.40,-.35,.40,-.11); add(-.40,-.11,-.17,.40); add(.17,-.11,.40,.40);
      } else if (form === "corner-block") {
        add(-.40,.04,.40,.40); add(-.40,-.36,-.14,.04);
      } else if (form === "podium-tower") {
        add(-.38,-.31,.38,.38,Math.min(2,count)); add(-.18,-.25,.18,.20,Math.max(1,count-2),"upper",2);
      } else { add(-.37,-.30,.37,.37,Math.min(3,count)); add(-.30,-.24,.27,.30,Math.max(1,count-3),"upper",3); }
    } else if (stage === 1) {
      add(-.33,-.35,.32,.17,1,"hall"); add(-.33,.17,-.10,.38,1,"office",0,3.2);
    } else if (stage === 2) {
      add(-.36,-.38,.35,.20,1,"hall"); add(.15,.20,.35,.42,2,"office",0,3.2);
    } else {
      add(-.37,-.38,.31,.12,1,"hall"); add(-.37,.12,-.17,.40,2,"office",0,3.2);
    }
    return masses;
  }

  function pushParcelGround(list, cx, cz, topY, footprint, masses, planning, palette, variant, night, stateName) {
    const w=footprint.w,d=footprint.h;
    const pave = {r:.64,g:.65,b:.60,a:1}, hedge = {r:.37,g:.46,b:.29,a:1};
    const block=(x,z,sx,sz,color=pave,height=.012,y=.006,tile="concrete",shape="box") =>
      pushBlock(list,cx+x,topY+y,cz+z,sx,height,sz,night?shade(color,.65):color,tile,shape);
    const open=(x,z,sx,sz) => !masses.some((m)=>x+sx/2>m.u0-.025 && x-sx/2<m.u1+.025 && z+sz/2>m.v0-.025 && z-sz/2<m.v1+.025);
    const tree=(x,z) => {
      if (!open(x,z,.18,.18)) return;
      block(x,z,.028,.028,palette.brick,.18,.09,"tree.trunk");
      block(x,z,.17,.17,hedge,.24,.28,"tree.canopy","canopy");
    };
    // Every entrance reaches the canonical street front (+z). Back gardens
    // remain private; the renderer rotates this whole parcel toward a road.
    for (const mass of masses.filter((m)=>m.y0===0 && !["hall","garage"].includes(m.usage))) {
      const x=(mass.u0+mass.u1)/2, front=mass.v1;
      const length=d/2-front;
      if(length>0) block(x,front+length/2,.065,length);
    }
    if (planning.zone === "residential") {
      for (const side of [-1,1]) block(side*(w/2-.025),0,.024,d*.94,hedge,.055,.027,"park");
      block(0,-d/2+.025,w*.94,.024,hedge,.055,.027,"park");
      tree(w*.37,-d*.39);
      if (planning.stage>1) { tree(-w*.32,d*.39); tree(w*.32,d*.39); }
      for (const garage of masses.filter((m)=>m.usage==="garage")) {
        const length=d/2-garage.v1;
        block((garage.u0+garage.u1)/2,garage.v1+length/2,garage.u1-garage.u0,length);
      }
      if (planning.stage>1) {
        const x=0,z=d*.30;
        if(open(x,z,.34,.18)) { block(x,z,.34,.18,pave); block(x-.1,z,.02,.11,palette.brick,.06,.04,"tree.trunk"); block(x+.1,z,.02,.11,palette.brick,.06,.04,"tree.trunk"); }
      }
    } else if (planning.zone === "commercial") {
      block(0,d*.45,w*.96,d*.10);
      for (const side of [-1,1]) tree(side*w*.43,-d*.38);
    } else {
      const hall=masses.find((m)=>m.usage==="hall");
      const front=hall?.v1||0;
      block(0,(front+d/2)/2,w*.9,d/2-front,{r:.53,g:.55,b:.51,a:1});
      // Loading positions and a turning apron are reserved before equipment.
      for(const x of [-w*.06,w*.16]) if(open(x,d*.37,.20,.28)) {
        for(const side of [-1,1]) block(x+side*.10,d*.37,.006,.28,{r:.78,g:.76,b:.64,a:1},.008,.016,"metal");
      }
      tree(w*.42,-d*.40);
    }
    if (stateName!=="normal" && stateName!=="recovering") return;
    // A correctly scaled parked car occupies a real bay, never a random lawn.
    const x=planning.zone==="residential" ? -w*.34 : w*.30;
    const z=d*.36;
    if(variant%3===0 && planning.stage>1 && open(x,z,.14,.30)) {
      block(x,z,.16,.32,pave);
      block(x,z,.112,.26,{r:.36,g:.41,b:.43,a:1},.065,.055,"metal");
      block(x,z-.015,.088,.135,{r:.24,g:.31,b:.34,a:1},.04,.107,"metal");
    }
  }


  function buildingMasses(footprint, heightPx, grammar, variant, seed) {
    if (grammar.planning) return plannedBuildingMasses(footprint, grammar.planning, Math.max(1, variant|0));
    const fw = Math.max(0.4, Number(footprint.w) || 1);
    const fd = Math.max(0.4, Number(footprint.h) || 1);
    const inset = Number.isFinite(grammar.inset) ? grammar.inset : 0.07;
    const u0 = -fw / 2 + inset;
    const v0 = -fd / 2 + inset;
    const u1 = fw / 2 - inset;
    const v1 = fd / 2 - inset;
    const px = Math.max(6, Number(heightPx) || 24);
    const height = pxToWorld(px * (Number(grammar.heightScale) || 1));
    const forms = Array.isArray(grammar.massing) && grammar.massing.length ? grammar.massing : ["single"];
    const form = forms[(Math.max(1, variant | 0) - 1) % forms.length];
    const wobble = ((seed >>> 6) & 7) / 40;
    if (form === "setback" && px > 24) {
      // The setback tower: a full base and a narrower upper body.
      const split = height * (0.5 + wobble);
      const s = 0.14 + wobble;
      return [
        { u0, v0, u1, v1, y0: 0, y1: split },
        { u0: u0 + s, v0: v0 + s, u1: u1 - s, v1: v1 - s, y0: split, y1: height },
      ];
    }
    if (form === "twin" && fw > 1.2) {
      const mid = (u0 + u1) / 2;
      const gap = 0.08;
      return [
        { u0, v0, u1: mid - gap, v1, y0: 0, y1: height },
        { u0: mid + gap, v0, u1, v1, y0: 0, y1: height * (0.6 + wobble) },
      ];
    }
    if (form === "wing") {
      const cut = v0 + (v1 - v0) * (0.54 + wobble);
      return [
        { u0, v0, u1, v1: cut, y0: 0, y1: height },
        { u0, v0: cut, u1, v1, y0: 0, y1: Math.max(pxToWorld(10), height * (0.44 + wobble)) },
      ];
    }
    if (form === "courtyard" && fw > 1.2) {
      const t = 0.26 + wobble * 0.4;
      return [
        { u0, v0, u1, v1: v0 + (v1 - v0) * t, y0: 0, y1: height },
        { u0, v0: v1 - (v1 - v0) * t, u1, v1, y0: 0, y1: height * (0.9 + wobble) },
        { u0, v0, u1: u0 + (u1 - u0) * t, v1, y0: 0, y1: height * (0.86 + wobble) },
        { u0: u1 - (u1 - u0) * t, v0, u1, v1, y0: 0, y1: height * (0.94 + wobble) },
      ];
    }
    if (form === "podium" && px > 30) {
      const skirt = Math.max(pxToWorld(10), height * (0.26 + wobble));
      const s = Math.min(0.3 + wobble, Math.min(fw, fd) * 0.3);
      return [
        { u0, v0, u1, v1, y0: 0, y1: skirt },
        { u0: u0 + s, v0: v0 + s, u1: u1 - s, v1: v1 - s, y0: skirt, y1: height },
      ];
    }
    if (form === "stepped" && px > 26) {
      const s = Math.min(0.13 + wobble * 0.5, Math.min(fw, fd) * 0.15);
      const a = height * (0.4 + wobble);
      const b = height * (0.72 + wobble * 0.5);
      return [
        { u0, v0, u1, v1, y0: 0, y1: a },
        { u0: u0 + s, v0: v0 + s, u1: u1 - s, v1: v1 - s, y0: a, y1: b },
        { u0: u0 + s * 2, v0: v0 + s * 2, u1: u1 - s * 2, v1: v1 - s * 2, y0: b, y1: height },
      ];
    }
    if (form === "gable") {
      const t = 0.42 + wobble;
      return [
        { u0, v0, u1, v1, y0: 0, y1: height },
        { u0: u0 + (u1 - u0) * 0.22, v0: v1 - 0.06, u1: u0 + (u1 - u0) * 0.72, v1: v1 + 0.16, y0: 0, y1: height * t },
      ];
    }
    return [{ u0, v0, u1, v1, y0: 0, y1: height }];
  }

  function grammarWallColor(recipes, grammar, variant, seed, fallback) {
    const walls = Array.isArray(grammar.walls) ? grammar.walls : [];
    const chosen = walls.length
      ? recipes.paletteColor(walls[((Math.max(1, variant | 0) - 1) * 5) % walls.length], "concrete")
      : fallback;
    // The 2D composer drifts each wall by up to 14/255 per building.
    const drift = (((seed >>> 9) & 15) - 7) * 0.6;
    // The neutral wall tile sits at 208/255, so the tint compensates by
    // 255/208 and the palette colour lands on the wall surface itself.
    return shade(chosen, (1 + drift / 160) * (255 / 208));
  }

  // Wall blocks tile the texture once per world unit. The wall tiles carry
  // one storey per row, so a column of one-unit blocks shows whole floors,
  // and the top block is cropped to k/rows rows so the height ends on a
  // floor line. Returns the built top of the mass (may round up).
  function pushWallMass(opaque, cx, cz, topY, mass, color, tile, rows) {
    const width = Math.max(0.05, mass.u1 - mass.u0);
    const depth = Math.max(0.05, mass.v1 - mass.v0);
    if (Number.isFinite(mass.storeyHeight) && Number.isInteger(mass.stories)) {
      const cols = Math.max(1, Math.ceil(width - 1e-6));
      const deps = Math.max(1, Math.ceil(depth - 1e-6));
      const cw = width / cols, cd = depth / deps;
      for (let level = 0; level < mass.stories; level += 1) {
        for (let i = 0; i < cols; i += 1) for (let j = 0; j < deps; j += 1) {
          const bx = cx + mass.u0 + cw * (i + 0.5);
          const bz = cz + mass.v0 + cd * (j + 0.5);
          const y0 = topY + mass.y0 + level * mass.storeyHeight;
          pushBlock(opaque, bx, y0 + mass.storeyHeight / 2, bz, cw - 0.012, mass.storeyHeight, cd - 0.012,
            color, `${tile}#1/${rows}`);
        }
      }
      return mass.y1;
    }
    const cols = Math.max(1, Math.ceil(width - 1e-6));
    const deps = Math.max(1, Math.ceil(depth - 1e-6));
    const cw = width / cols;
    const cd = depth / deps;
    const bands = Math.max(1, rows | 0);
    const total = Math.max(1 / bands, mass.y1 - mass.y0);
    const full = Math.floor(total + 1e-6);
    const remainder = total - full;
    const partRows = remainder > 1e-3 ? remainder * bands : 0;
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < deps; j += 1) {
        const bx = cx + mass.u0 + cw * (i + 0.5);
        const bz = cz + mass.v0 + cd * (j + 0.5);
        // Every segment under the top one shrinks by a hair, so the block
        // above covers its top face and the seam does not z-fight.
        const seam = 0.004;
        for (let level = 0; level < full; level += 1) {
          const topmost = !partRows && level === full - 1;
          const inset = topmost ? 0 : seam;
          pushBlock(opaque, bx, topY + mass.y0 + level + 0.5, bz, cw - inset, 1, cd - inset, color, tile);
        }
        if (partRows) {
          const h = partRows / bands;
          pushBlock(opaque, bx, topY + mass.y0 + full + h / 2, bz, cw, h, cd, color, `${tile}#${partRows}/${bands}`);
        }
      }
    }
    return mass.y0 + full + (partRows ? partRows / bands : 0);
  }

  // A flat roof is a dark deck inside a light parapet rim, not a lid.
  function pushFlatRoof(opaque, cx, cz, y, mass, rimColor, deckColor) {
    const w = mass.u1 - mass.u0;
    const d = mass.v1 - mass.v0;
    const mx = cx + (mass.u0 + mass.u1) / 2;
    const mz = cz + (mass.v0 + mass.v1) / 2;
    const t = 0.06;
    const h = 0.07;
    pushBlock(opaque, mx, y + h / 2, cz + mass.v0 + t / 2, w, h, t, rimColor, "concrete");
    pushBlock(opaque, mx, y + h / 2, cz + mass.v1 - t / 2, w, h, t, rimColor, "concrete");
    pushBlock(opaque, cx + mass.u0 + t / 2, y + h / 2, mz, t, h, d, rimColor, "concrete");
    pushBlock(opaque, cx + mass.u1 - t / 2, y + h / 2, mz, t, h, d, rimColor, "concrete");
    pushBlock(opaque, mx, y + 0.015, mz, Math.max(0.05, w - 2 * t), 0.03, Math.max(0.05, d - 2 * t), deckColor, "roof.deck");
  }

  // A stepped gabled roof: stacked slabs narrowing to the ridge along the
  // longer axis, with an eave overhang; hipped narrows along both axes.
  function pushPitchedRoof(opaque, cx, cz, y, mass, roofColor, risePx, hipped) {
    const w = mass.u1 - mass.u0;
    const d = mass.v1 - mass.v0;
    const mx = cx + (mass.u0 + mass.u1) / 2;
    const mz = cz + (mass.v0 + mass.v1) / 2;
    const rise = Math.max(0.12, pxToWorld(risePx));
    const ridgeAlongX = w >= d;
    pushBlock(opaque, mx, y + rise / 2, mz, w * 1.06, rise, d * 1.06, roofColor, "roof", hipped ? "hip" : ridgeAlongX ? "roof-x" : "roof-z");
  }

  function pushSawtoothRoof(opaque, cx, cz, y, mass, roofColor, glassColor) {
    const w = mass.u1 - mass.u0;
    const d = mass.v1 - mass.v0;
    const mz = cz + (mass.v0 + mass.v1) / 2;
    const teeth = Math.max(2, Math.round(w * 2));
    const step = w / teeth;
    const rise = Math.max(0.1, pxToWorld(5));
    for (let i = 0; i < teeth; i += 1) {
      const ax = cx + mass.u0 + step * (i + 0.5);
      pushBlock(opaque, ax, y + rise * 0.25, mz, step, rise * 0.5, d, shade(roofColor, 0.85), "roof.deck");
      pushBlock(opaque, ax + step * 0.25, y + rise * 0.75, mz, step * 0.5, rise * 0.5, d, roofColor, "roof.deck");
      pushBlock(opaque, ax + step * 0.5 - 0.012, y + rise * 0.5, mz, 0.024, rise * 0.9, d * 0.96, glassColor);
    }
  }

  // A raised centre block on a flat roof: the stepped-parapet skyline.
  function pushSteppedRoof(opaque, cx, cz, y, mass, rimColor, deckColor) {
    pushFlatRoof(opaque, cx, cz, y, mass, rimColor, deckColor);
    const w = mass.u1 - mass.u0;
    const d = mass.v1 - mass.v0;
    const s = Math.min(0.2, Math.min(w, d) * 0.25);
    const mx = cx + (mass.u0 + mass.u1) / 2;
    const mz = cz + (mass.v0 + mass.v1) / 2;
    const stepH = 0.2;
    pushBlock(opaque, mx, y + 0.07 + stepH / 2, mz, Math.max(0.1, w - 2 * s), stepH, Math.max(0.1, d - 2 * s), rimColor, "concrete");
    pushBlock(opaque, mx, y + 0.07 + stepH + 0.01, mz, Math.max(0.06, w - 2 * s - 0.08), 0.02, Math.max(0.06, d - 2 * s - 0.08), deckColor, "roof.deck");
  }

  // Roof furniture is the strongest "this is a city" signal per block spent.
  function pushRoofClutter(opaque, cx, cz, y, mass, items, palette, wallColor, seed, massHeightPx) {
    const w = mass.u1 - mass.u0;
    const d = mass.v1 - mass.v0;
    const at = (fu, fv) => ({ x: cx + mass.u0 + w * Math.min(0.92, fu), z: cz + mass.v0 + d * Math.min(0.92, fv) });
    items.forEach((item, index) => {
      const jitterA = ((seed >>> (index * 3)) & 7) / 16;
      const jitterB = ((seed >>> (index * 5 + 2)) & 7) / 16;
      if (item === "tank") {
        const c = at(0.24 + jitterA, 0.26 + jitterB);
        const s = Math.min(0.075, Math.max(0.04, w * 0.045));
        const drum = pxToWorld(Math.max(5, Math.min(11, Math.round(massHeightPx * 0.16))));
        pushBlock(opaque, c.x, y + 0.05, c.z, s * 2, 0.1, s * 2, palette.steel, "metal");
        pushBlock(opaque, c.x, y + 0.1 + drum / 2, c.z, s * 2, drum, s * 2, shade(palette.steel, 1.12), "metal");
      } else if (item === "bulkhead") {
        const c = at(0.26 + jitterA, 0.6);
        pushBlock(opaque, c.x, y + 0.08, c.z, 0.18, 0.16, 0.18, wallColor, "concrete");
      } else if (item === "vents") {
        for (let i = 0; i < 3; i += 1) {
          const c = at(0.2 + i * 0.26, 0.3 + (i % 2) * 0.32);
          pushBlock(opaque, c.x, y + 0.05, c.z, 0.18, 0.1, 0.18, palette.metal, "metal");
        }
      } else if (item === "chimney") {
        const c = at(0.7, 0.28);
        const h = pxToWorld(9);
        pushBlock(opaque, c.x, y + h / 2 - 0.03, c.z, 0.075, h, 0.075, palette.brick, "concrete");
      } else if (item === "stack") {
        const c = at(0.22 + jitterA + index * 0.18, 0.3 + jitterB * 0.5);
        const tallPx = Math.max(20, Math.round(massHeightPx * 0.62)) + (((seed >>> (index * 4)) & 3) * 3);
        const tall = pxToWorld(tallPx);
        const r = Math.min(0.2, Math.max(0.1, w * 0.11));
        pushBlock(opaque, c.x, y + tall / 2, c.z, r * 2, tall, r * 2, palette.stack, "concrete");
        pushBlock(opaque, c.x, y + tall - pxToWorld(8), c.z, r * 2 + 0.02, pxToWorld(2), r * 2 + 0.02, shade(palette.red, 0.75), "metal");
      } else if (item === "coolingTower") {
        // A wide foot, a pinched waist, a flared lip, a dark mouth.
        const c = at(0.28 + index * 0.4, 0.42);
        const tall = pxToWorld(Math.max(26, Math.round(massHeightPx * 0.7)));
        const foot = Math.min(0.42, Math.max(0.24, w * 0.28));
        const drums = [[foot, 0, 0.4, 0.9], [foot * 0.7, 0.4, 0.78, 1], [foot * 0.92, 0.78, 1, 1.1]];
        drums.forEach(([radius, a, b, tone]) => {
          pushBlock(opaque, c.x, y + tall * (a + b) / 2, c.z, radius * 2, tall * (b - a), radius * 2, shade(palette.concrete, tone), "concrete");
        });
        const mouth = foot * 0.92 * 0.72;
        pushBlock(opaque, c.x, y + tall + 0.01, c.z, mouth * 2, 0.02, mouth * 2, palette.black);
      } else if (item === "sign") {
        const c = at(0.5, 0.46);
        const h = pxToWorld(7);
        const lift = pxToWorld(2);
        const signColor = index % 2 ? palette.signCool : palette.sign;
        pushBlock(opaque, c.x, y + lift + h / 2, c.z, w * 0.6, h, 0.06, signColor, "metal");
        pushBlock(opaque, c.x - w * 0.25, y + lift / 2, c.z, 0.03, lift, 0.03, palette.metal, "metal");
        pushBlock(opaque, c.x + w * 0.25, y + lift / 2, c.z, 0.03, lift, 0.03, palette.metal, "metal");
      } else if (item === "antenna") {
        const c = at(0.5, 0.5);
        const h = pxToWorld(15);
        pushBlock(opaque, c.x, y + h / 2, c.z, 0.03, h, 0.03, palette.metal, "metal");
        pushBlock(opaque, c.x, y + h + 0.03, c.z, 0.06, 0.06, 0.06, palette.red);
      }
    });
  }

  // Ground floor on the tallest mass: a door, a shopfront with an awning,
  // or a loading door, as untextured blocks that stand a little proud of
  // the wall so they read from every rotation.
  function pushGroundFloor(opaque, cx, cz, baseY, mass, spec, palette, variant, prefix) {
    if (!spec || typeof spec !== "object") return;
    const w = mass.u1 - mass.u0;
    const d = mass.v1 - mass.v0;
    const mx = cx + (mass.u0 + mass.u1) / 2;
    const mz = cz + (mass.v0 + mass.v1) / 2;
    const h = Math.max(0.16, pxToWorld(spec.height || 7));
    if (spec.kind === "shopfront") {
      const glassH = Math.max(0.1, h - 0.06);
      const faces = [
        [mx, cz + mass.v1 + 0.006, Math.max(0.1, w - 0.1), 0.012, mx, cz + mass.v1 + 0.05, 0.1],
        [mx, cz + mass.v0 - 0.006, Math.max(0.1, w - 0.1), 0.012, mx, cz + mass.v0 - 0.05, 0.1],
        [cx + mass.u1 + 0.006, mz, 0.012, Math.max(0.1, d - 0.1), cx + mass.u1 + 0.05, mz, 0.1],
        [cx + mass.u0 - 0.006, mz, 0.012, Math.max(0.1, d - 0.1), cx + mass.u0 - 0.05, mz, 0.1],
      ];
      const awning = prefix === "c" && variant % 2 ? palette.awningAlt : palette.awning;
      faces.forEach(([x, z, sx, sz, ax, az, depth]) => {
        pushBlock(opaque, x, baseY + 0.03 + glassH / 2, z, sx, glassH, sz, palette.glassCool);
        const alongX = sx > sz;
        pushBlock(opaque, ax, baseY + h + 0.02, az, alongX ? sx : depth, 0.04, alongX ? depth : sz, awning);
      });
      return;
    }
    if (spec.kind === "loading") {
      const doorH = Math.max(0.12, h - 0.04);
      pushBlock(opaque, mx, baseY + doorH / 2, cz + mass.v1 + 0.01, Math.max(0.16, w * 0.44), doorH, 0.02, palette.door);
      pushBlock(opaque, cx + mass.u1 + 0.01, baseY + doorH / 2, mz, 0.02, doorH, Math.max(0.16, d * 0.44), palette.door);
      return;
    }
    pushBlock(opaque, mx, baseY + 0.12, cz + mass.v1 + 0.01, 0.14, 0.24, 0.02, palette.door);
    pushBlock(opaque, cx + mass.u1 + 0.01, baseY + 0.12, mz, 0.02, 0.24, 0.14, palette.door);
  }

  // One building from its grammar: masses, walls, roofs, ground floor and
  // roof furniture. States follow the 2D composer: foundation is a slab,
  // construction is a short striped body with scaffold poles, abandoned
  // keeps its masses under a dark deck and no furniture.
  function pushGrammarBuilding(opaque, recipes, palette, options) {
    const { cx, cz, topY, footprint, grammar, variant, night, stateName, wallTile, wallColor, heightPx, seed, rows } = options;
    const parapetColor = options.parapetColor || wallColor;
    if (stateName === "foundation") {
      pushBlock(opaque, cx, topY + 0.04, cz, footprint.w * 0.9, 0.08, footprint.h * 0.9, palette.concrete, "concrete");
      return;
    }
    const masses = buildingMasses(footprint, heightPx, grammar, variant, seed);
    const built = masses.map((mass) => ({ mass, top: pushWallMass(opaque, cx, cz, topY, mass, wallColor, wallTile, rows) }));
    const tallest = Math.max(...built.map((entry) => entry.top));
    if (grammar.planning) pushParcelGround(opaque, cx, cz, topY, footprint, masses, grammar.planning, palette, variant, night, stateName);
    const construction = stateName === "construction";
    if (construction) {
      // Two scaffold poles past the corners, the 2D composer's diagonal
      // construction lines read as blocks.
      const poleH = tallest + 0.3;
      const outer = masses[0];
      pushBlock(opaque, cx + outer.u0 - 0.03, topY + poleH / 2, cz + outer.v1 + 0.03, 0.04, poleH, 0.04, palette.construction, "metal");
      pushBlock(opaque, cx + outer.u1 + 0.03, topY + poleH / 2, cz + outer.v0 - 0.03, 0.04, poleH, 0.04, palette.construction, "metal");
    }
    const roofForms = Array.isArray(grammar.roof) && grammar.roof.length ? grammar.roof : ["flat"];
    const roofForm = roofForms[(Math.max(1, variant | 0) - 1 + Math.floor((variant - 1) / 4)) % roofForms.length];
    const roofSet = Array.isArray(grammar.roofColors) ? grammar.roofColors : [];
    const roofColor = night
      ? palette.roofDark
      : roofSet.length ? recipes.paletteColor(roofSet[((Math.max(1, variant | 0) - 1) * 11) % roofSet.length], "roofTile") : palette.roofTile;
    const deckColor = night ? shade(palette.roofDeck, 0.6) : palette.roofDeck;
    built.forEach(({ mass, top }) => {
      const y = topY + top;
      if (stateName === "abandoned") {
        pushFlatRoof(opaque, cx, cz, y, mass, parapetColor, shade(deckColor, 0.7));
        return;
      }
      if (roofForm === "pitched") pushPitchedRoof(opaque, cx, cz, y, mass, roofColor, grammar.roofRise || 8, false);
      else if (roofForm === "hipped") pushPitchedRoof(opaque, cx, cz, y, mass, roofColor, grammar.roofRise || 8, true);
      else if (roofForm === "sawtooth") pushSawtoothRoof(opaque, cx, cz, y, mass, roofColor, night ? shade(palette.glassCool, 0.5) : palette.glassCool);
      else if (roofForm === "stepped") pushSteppedRoof(opaque, cx, cz, y, mass, parapetColor, deckColor);
      else pushFlatRoof(opaque, cx, cz, y, mass, parapetColor, deckColor);
      if (top !== tallest) return;
      pushGroundFloor(opaque, cx, cz, topY, mass, grammar.groundFloor, palette, variant, options.prefix || "");
      if (construction || !Array.isArray(grammar.clutter) || !grammar.clutter.length) return;
      const massHeightPx = (mass.y1 - mass.y0) * PX_PER_WORLD_Y;
      const massWidth = Math.min(mass.u1 - mass.u0, mass.v1 - mass.v0);
      // Tall furniture needs a tall building under it; a small roof gets
      // vents and a chimney and nothing more.
      const allowed = grammar.clutter.filter((item) => {
        if (item === "stack" || item === "coolingTower") return massHeightPx >= 26;
        if (item === "tank") return massHeightPx >= 34 && massWidth >= 0.9;
        if (item === "antenna") return massHeightPx >= 44;
        if (item === "sign") return massWidth >= 0.9;
        if (item === "bulkhead") return massHeightPx >= 22;
        return true;
      });
      if (!allowed.length) return;
      const identity = allowed.some((item) => item === "stack" || item === "coolingTower");
      const cap = identity ? allowed.length : massHeightPx >= 44 ? allowed.length : massHeightPx >= 26 ? 2 : 1;
      const count = identity
        ? Math.min(allowed.length, 3)
        : 1 + ((seed >>> 3) % Math.max(1, Math.min(cap, allowed.length)));
      const items = [];
      for (let i = 0; i < count; i += 1) items.push(allowed[(Math.max(1, variant | 0) - 1 + i) % allowed.length]);
      pushRoofClutter(opaque, cx, cz, y, mass, items, palette, wallColor, seed, massHeightPx);
    });
  }

  function terrainTopY(snapshot, index) {
    return altitudeAt(snapshot, index) * ALT_STEP;
  }

  function collectChunkBlocks(snapshot, recipes, chunkX, chunkY, sceneObjects, objectsOnly = false) {
    const size = mapSize(snapshot);
    const startX = chunkX * CHUNK_SIZE;
    const startY = chunkY * CHUNK_SIZE;
    const endX = Math.min(size, startX + CHUNK_SIZE);
    const endY = Math.min(size, startY + CHUNK_SIZE);
    const opaque = [];
    const water = [];
    const tint = [];
    const cliffs = new Map();
    cliffEdges(snapshot).forEach((edge) => {
      const key = `${edge.x}:${edge.y}`;
      if (!cliffs.has(key)) cliffs.set(key, []);
      cliffs.get(key).push(edge);
    });

    const altOf = (x, y, fallback) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return 0;
      const index = y * size + x;
      const value = altitudeAt(snapshot, index);
      return Number.isFinite(value) ? value : fallback;
    };

    for (let y = objectsOnly ? endY : startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const index = y * size + x;
        const alt = altitudeAt(snapshot, index);
        const kind = terrainKindAt(snapshot, index);
        const topY = alt * ALT_STEP;
        // Kept gentle: instance colors now convert through sRGB, which
        // widens multiplicative steps, so ±6% here read as a checkerboard.
        const jitter = 0.995 + Math.sin(x * 0.21 + y * 0.13) * 0.005;

        if (kind === "water") {
          // Bed column below, translucent surface on top. A future v3
          // waterLevel layer lifts the surface defensively.
          const bed = recipes.terrain.water.bed;
          pushBlock(opaque, x + 0.5, topY - ALT_STEP / 2, y + 0.5, 1, ALT_STEP, 1, shade(bed, jitter));
          const level = Number(gridValue(snapshot, ["waterLevel"], index, NaN));
          const surfaceY = Number.isFinite(level) && level > alt ? level * ALT_STEP : topY;
          const salt = Boolean(gridValue(snapshot, ["salt"], index, false));
          const surface = salt ? shade(recipes.terrain.water.lit, 1.05) : recipes.terrain.water.surface;
          // Seasonal water: winter freezes to a pale ice, spring brightens.
          const season = Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375);
          const seasonalSurface = season === 3
            ? {
                r: Math.min(1, surface.r + 0.12), g: Math.min(1, surface.g + 0.14), b: Math.min(1, surface.b + 0.18), a: 0.92,
              }
            : season === 0 ? shade(surface, 1.06) : surface;
          // The surface rides just above the bed's top face: with both faces
          // at the same height the transparent surface lost the depth test
          // and the lake showed as bare bed.
          water.push({
            x: x + 0.5, y: surfaceY + 0.02, z: y + 0.5, sx: 1, sy: 0.06, sz: 1,
            r: seasonalSurface.r, g: seasonalSurface.g, b: seasonalSurface.b, a: seasonalSurface.a,
            tile: "water",
          });
        } else {
          const style = (alt < 24 && (kind === "soil" || kind === "rock")) ? recipes.terrain.grass : recipes.terrain[kind] || recipes.terrain.grass;
          const minNeighbor = Math.min(
            altOf(x - 1, y, alt), altOf(x + 1, y, alt), altOf(x, y - 1, alt), altOf(x, y + 1, alt), alt
          );
          // Only exposed levels get blocks: from one above the lowest
          // neighbor to the tile's own top. Altitude zero keeps one block.
          const startLevel = Math.min(alt, minNeighbor + 1);
          for (let level = startLevel; level <= alt; level += 1) {
            const top = level === alt;
            // Snow: peaks above the snow line always wear a white cap, and
            // in winter the whole lowland snows over — the OpenTTD-principled
            // terrain read, driven by the snapshot calendar.
            const winter = Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375) === 3;
            const snow = (kind === "grass" || kind === "slope") && (alt >= 24 || winter);
            const color = shade(snow && top ? { r: 0.92, g: 0.94, b: 0.96, a: 1 } : (top ? style.top : style.side), jitter);
            // Natural soil and rock in the lowland keep the grass texture
            // under their leaned colour: three ground textures scattered
            // tile by tile read as camouflage, one texture reads as ground.
            const terrainTile = snow && top ? "terrain.snow"
              : kind === "grass" || kind === "slope" ? "terrain.grass"
                : kind === "coast" ? "terrain.sand"
                  : (kind === "soil" || kind === "rock") && alt < 24 ? "terrain.grass"
                    : `terrain.${kind}`;
            const slopeMask = (altOf(x, y - 1, alt) > alt ? 1 : 0) | (altOf(x + 1, y, alt) > alt ? 2 : 0)
              | (altOf(x, y + 1, alt) > alt ? 4 : 0) | (altOf(x - 1, y, alt) > alt ? 8 : 0);
            const slopeShape = top && slopeMask && gridValue(snapshot, ["slope"], index, false)
              && !isRoad(snapshot, index) && !sceneObjects.covered.has(`${x}:${y}`) ? `slope-${slopeMask}` : "box";
            pushBlock(opaque, x + 0.5, level * ALT_STEP - ALT_STEP / 2, y + 0.5, 1, ALT_STEP, 1, color, top ? terrainTile : (kind === "grass" || kind === "slope" ? "terrain.grass" : `terrain.${kind}`), slopeShape);
          }
          // Cliff shadow bands: the lower tile carries a dark edge toward
          // every higher neighbour, so plateaus read as stacked ground.
          const tileCliffs = cliffs.get(`${x}:${y}`);
          if (tileCliffs) {
            const shadow = { r: 0.07, g: 0.09, b: 0.08, a: 0.4 };
            tileCliffs.forEach((edge) => {
              if (edge.dir === "n") pushBlock(tint, x + 0.5, topY + 0.012, y + 0.03, 1, 0.02, 0.07, shadow);
              if (edge.dir === "s") pushBlock(tint, x + 0.5, topY + 0.012, y + 0.97, 1, 0.02, 0.07, shadow);
              if (edge.dir === "e") pushBlock(tint, x + 0.97, topY + 0.012, y + 0.5, 0.07, 0.02, 1, shadow);
              if (edge.dir === "w") pushBlock(tint, x + 0.03, topY + 0.012, y + 0.5, 0.07, 0.02, 1, shadow);
            });
          }
          // Beach ring: where low land meets water, a sand lip follows the
          // shoreline so coasts read like SimCity 2000 beaches rather than a
          // hard grass-to-water step.
          if (kind !== "water" && alt <= 1) {
            const shoreMask = networkMask(snapshot, x, y, size, isWater);
            const sand = recipes.terrain.coast.top;
            if (shoreMask & 1) pushBlock(opaque, x + 0.5, topY + 0.012, y + 0.06, 1, 0.026, 0.12, sand, "terrain.sand");
            if (shoreMask & 4) pushBlock(opaque, x + 0.5, topY + 0.012, y + 0.94, 1, 0.026, 0.12, sand, "terrain.sand");
            if (shoreMask & 2) pushBlock(opaque, x + 0.94, topY + 0.012, y + 0.5, 0.12, 0.026, 1, sand, "terrain.sand");
          if (shoreMask & 8) pushBlock(opaque, x + 0.06, topY + 0.012, y + 0.5, 0.12, 0.026, 1, sand, "terrain.sand");
        }
        }

        const masks = {
          road: isRoad(snapshot, index) ? networkMask(snapshot, x, y, size, isRoad) : 0,
          rail: isRail(snapshot, index) ? networkMask(snapshot, x, y, size, isRail) : 0,
          wire: isWire(snapshot, index) ? networkMask(snapshot, x, y, size, isWire) : 0,
          pipe: isPipe(snapshot, index) ? networkMask(snapshot, x, y, size, isPipe) : 0,
          highway: gridValue(snapshot, ["highway"], index, false)
            ? networkMask(snapshot, x, y, size, (snap, i) => Boolean(gridValue(snap, ["highway"], i, false)))
            : 0,
        };
        const tunnel = isTunnel(snapshot, index);
        const cx = x + 0.5;
        const cz = y + 0.5;

        if (masks.pipe) {
          pushBlock(opaque, cx, topY + 0.015, cz, 0.94, 0.04, 0.94, recipes.connectors.pipe, "pipe");
          pushPathStrip(opaque, cx, topY + 0.04, cz, masks.pipe, shade(recipes.connectors.pipe, 1.12), 0.12, 0.03, "pipe");
        }
        if (masks.rail) {
          pushBlock(opaque, cx, topY + 0.04, cz, 0.96, 0.08, 0.96, recipes.connectors.rail, "rail");
          pushTwinRails(opaque, cx, topY + 0.1, cz, masks.rail, recipes.connectors.railAccent, "metal");
        }
        if (masks.road) {
          if (isWater(snapshot, index) || tunnel) {
            pushBlock(opaque, cx, topY + 0.03, cz, 1, 0.06, 1, recipes.connectors.road, tunnel ? "tunnel" : "road");
          } else {
            pushPathStrip(opaque, cx, topY + 0.03, cz, masks.road, recipes.connectors.road, 0.56, 0.06, "road");
          }
          if (tunnel) {
            const tunnelMask = networkMask(snapshot, x, y, size, (snap, i) => isTunnel(snap, i));
            pushTunnelPortals(opaque, cx, topY, cz, tunnelMask, snapshot, x, y, size);
          }
          pushPathStrip(opaque, cx, topY + 0.062, cz, masks.road, recipes.connectors.roadAccent, 0.025, 0.02, "metal");
          if (isWater(snapshot, index)) pushBridgeGuards(opaque, cx, topY, cz, masks.road);
          else if (!tunnel) pushRoadCurbs(opaque, cx, topY, cz, masks.road);
        }
        if (masks.highway) {
          // An elevated deck on piers, not a painted slab: the deck rides
          // clear of the ground, every edge that does not continue onto
          // another highway tile carries a concrete parapet, and a support
          // pier drops to the ground so the elevation reads from the side.
          // Worn concrete-grey, clearly lighter than a street, matching the
          // 2D deck (shade +22 over the highway base colour).
          const deckColor = shade(recipes.catalogCategories.highway, 1.3);
          const deckTop = topY + 0.3;
          const parapet = shade(recipes.catalogCategories.infrastructure, 1.16);
          pushBlock(opaque, cx, deckTop, cz, 1, 0.1, 1, deckColor, "road");
          // Lane strips follow the run axis only. An interior tile of a
          // two-wide run has a third connection toward its sibling
          // carriageway, and striping that arm too covered the deck in
          // bracket shapes instead of lanes (the 2D deck applies the same
          // full-pair rule).
          const fullNS = (masks.highway & 5) === 5;
          const fullEW = (masks.highway & 10) === 10;
          const runMask = fullNS && !fullEW ? masks.highway & 5
            : fullEW && !fullNS ? masks.highway & 10
              : masks.highway;
          pushPathStrip(opaque, cx, deckTop + 0.065, cz, runMask, recipes.connectors.roadAccent, 0.08, 0.02, "metal");
          if (!(masks.highway & 1)) pushBlock(opaque, cx, deckTop + 0.09, cz - 0.46, 1, 0.08, 0.08, parapet, "metal");
          if (!(masks.highway & 4)) pushBlock(opaque, cx, deckTop + 0.09, cz + 0.46, 1, 0.08, 0.08, parapet, "metal");
          if (!(masks.highway & 2)) pushBlock(opaque, cx + 0.46, deckTop + 0.09, cz, 0.08, 0.08, 1, parapet, "metal");
          if (!(masks.highway & 8)) pushBlock(opaque, cx - 0.46, deckTop + 0.09, cz, 0.08, 0.08, 1, parapet, "metal");
          if (!isWater(snapshot, index)) {
            pushBlock(opaque, cx, topY + 0.125, cz, 0.16, 0.25, 0.16, shade(deckColor, 0.86), "metal");
          }
          if (isWater(snapshot, index)) pushBridgeGuards(opaque, cx, deckTop, cz, masks.highway);
        }
        if (gridValue(snapshot, ["onramp"], index, false)) {
          pushBlock(opaque, cx, topY + 0.07, cz, 0.9, 0.14, 0.9, recipes.catalogCategories.onramp, "road");
          // A real ramp: a wide highway-end slab and a narrow road-end slab
          // tapering through the tile centre, by neighbour directions.
          const hMask = networkMask(snapshot, x, y, size, (s, i) => Boolean(gridValue(s, ["highway"], i, false)) || Boolean(gridValue(s, ["onramp"], i, false)));
          const rMask = networkMask(snapshot, x, y, size, isRoad);
          const dirsOf = (mask) => [["n", 1], ["e", 2], ["s", 4], ["w", 8]].filter(([, bit]) => mask & bit).map(([dir]) => dir);
          const hDirs = dirsOf(hMask);
          const rDirs = dirsOf(rMask);
          if (hDirs.length === 1 && rDirs.length === 1) {
            const rampColor = recipes.catalogCategories.onramp;
            const wide = 0.82;
            const narrow = 0.4;
            const [h, r] = [hDirs[0], rDirs[0]];
            // The highway half of the ramp steps up toward the raised deck
            // so the climb reads even without a sloped block.
            if (h === "n" || h === "s") pushBlock(opaque, cx, topY + 0.21, h === "n" ? cz - 0.25 : cz + 0.25, wide, 0.13, 0.5, rampColor, "road");
            else pushBlock(opaque, h === "e" ? cx + 0.25 : cx - 0.25, topY + 0.21, cz, 0.5, 0.13, wide, rampColor, "road");
            if (r === "n" || r === "s") pushBlock(opaque, cx, topY + 0.075, r === "n" ? cz - 0.25 : cz + 0.25, narrow, 0.13, 0.5, rampColor, "road");
            else pushBlock(opaque, r === "e" ? cx + 0.25 : cx - 0.25, topY + 0.075, cz, 0.5, 0.13, narrow, rampColor, "road");
          }
        }
        if (masks.wire) {
          pushBlock(opaque, cx, topY + 0.26, cz, 0.08, 0.52, 0.08, recipes.connectors.wire, "wire");
          pushPathStrip(opaque, cx, topY + 0.46, cz, masks.wire, shade(recipes.connectors.wire, 1.18), 0.02, 0.02, "wire");
        }
        if (isPark(snapshot, index)) {
          pushBlock(opaque, x + 0.5, topY + 0.025, y + 0.5, 0.94, 0.05, 0.94, recipes.connectors.park, "park");
          const canopy = (hashTile(index) & 1) ? recipes.tree.canopy : recipes.tree.canopyLight;
          pushBlock(opaque, x + 0.35, topY + 0.05 + 0.14, y + 0.6, 0.28, 0.28, 0.28, canopy, "tree.canopy");
        }
        if (isTree(snapshot, index)) {
          // The four-season canopy: sakura in spring, deep green in summer,
          // maples in autumn, snow-dusted crowns in winter — deterministic
          // per tile and snapshot clock.
          const season = Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375);
          // One tree in eight blossoms; at one in three the spring forest
          // read as pink confetti instead of woods with sakura in them.
          const blossom = season === 0 && hashTile(index * 29) % 8 === 0;
          const maple = season === 2 && hashTile(index * 13) % 2 === 0;
          const winter = season === 3;
          let canopy;
          let canopyTile;
          if (blossom) {
            canopy = { r: 0.94, g: 0.76, b: 0.76, a: 1 };
            canopyTile = "tree.blossom";
          } else if (maple) {
            canopy = { r: 0.74, g: 0.25, b: 0.2, a: 1 };
            canopyTile = "tree.maple";
          } else if (winter) {
            canopy = { r: 0.6, g: 0.62, b: 0.58, a: 1 };
            canopyTile = "tree.winter";
          } else {
            canopy = (hashTile(index) & 1) ? recipes.tree.canopy : recipes.tree.canopyLight;
            canopyTile = "tree.canopy";
          }
          const shadeV = 0.9 + (hashTile(index * 7) % 5) * 0.05;
          const treeKind = 1 + (hashTile(index) % 3);
          if (treeKind === 2) {
            // Conifer: a tower of shrinking green tiers, the Minecraft pine.
            pushBlock(opaque, cx, topY + 0.1, cz, 0.1, 0.22, 0.1, recipes.tree.trunk, "tree.trunk");
            for (let tier = 0; tier < 3; tier += 1) {
              const width = 0.56 - tier * 0.14;
              pushBlock(opaque, cx, topY + 0.28 + tier * 0.2, cz, width, 0.36, width, shade(canopy, shadeV), canopyTile, "conifer");
            }
          } else if (treeKind === 3) {
            // Young sapling: short trunk, one small crown.
            pushBlock(opaque, cx, topY + 0.08, cz, 0.08, 0.16, 0.08, recipes.tree.trunk, "tree.trunk");
            pushBlock(opaque, cx, topY + 0.27, cz, 0.34, 0.3, 0.34, shade(canopy, shadeV + 0.04), canopyTile, "canopy");
          } else {
            // Broadleaf: trunk under a wide lower crown and a narrow upper
            // crown, so the tree reads as a crown and not as a cube.
            pushBlock(opaque, cx, topY + 0.175, cz, 0.12, 0.35, 0.12, recipes.tree.trunk, "tree.trunk");
            pushBlock(opaque, cx, topY + 0.55, cz, 0.62, 0.62, 0.56, shade(canopy, shadeV), canopyTile, "canopy");
          }
        }

        const zone = zonePrefix(gridValue(snapshot, ["zone", "zoneType"], index, ZONE.NONE));
        const stage = Number(gridValue(snapshot, ["stage", "buildingStage"], index, 0)) | 0;
        if (zone && !stage && !sceneObjects.covered.has(`${x}:${y}`)) {
          tint.push({
            x: x + 0.5, y: topY + 0.012, z: y + 0.5, sx: 0.96, sy: 0.024, sz: 0.96,
            ...recipes.zoneTint[zone],
          });
        }
        // Military, airport, and seaport zones (4/5/6) get real ground slabs
        // — olive installation, runway pad, and dock — so port zones read as
        // built ground instead of invisible grass.
        const rawZone = Number(gridValue(snapshot, ["zone", "zoneType"], index, 0)) | 0;
        if (rawZone === 4 || rawZone === 5 || rawZone === 6) {
          const zoneTile = rawZone === 5 ? "zone.airport" : rawZone === 6 ? "zone.seaport" : "zone.military";
          const zoneColor = rawZone === 5
            ? { r: 0.48, g: 0.5, b: 0.55, a: 1 }
            : rawZone === 6 ? { r: 0.55, g: 0.6, b: 0.64, a: 1 } : { r: 0.48, g: 0.52, b: 0.34, a: 1 };
          pushBlock(opaque, cx, topY + 0.022, cz, 1, 0.045, 1, zoneColor, zoneTile);
          if (rawZone === 5 && hashTile(index * 17) % 7 === 0) {
            // Airport control tower: a pale mast with a cab and a red light.
            pushBlock(opaque, cx, topY + 0.45, cz, 0.1, 0.9, 0.1, { r: 0.78, g: 0.76, b: 0.7, a: 1 }, "concrete");
            pushBlock(opaque, cx, topY + 0.92, cz, 0.18, 0.12, 0.18, { r: 0.9, g: 0.88, b: 0.82, a: 1 }, "metal");
            pushBlock(opaque, cx, topY + 1.02, cz, 0.05, 0.08, 0.05, { r: 0.82, g: 0.28, b: 0.22, a: 1 }, "metal");
          }
          if (rawZone === 6 && hashTile(index * 19) % 7 === 0) {
            // Dock crane: two legs, a beam, and a red hoist.
            pushBlock(opaque, cx - 0.16, topY + 0.22, cz, 0.05, 0.44, 0.05, { r: 0.54, g: 0.54, b: 0.5, a: 1 }, "metal");
            pushBlock(opaque, cx + 0.16, topY + 0.22, cz, 0.05, 0.44, 0.05, { r: 0.54, g: 0.54, b: 0.5, a: 1 }, "metal");
            pushBlock(opaque, cx, topY + 0.44, cz, 0.36, 0.05, 0.05, { r: 0.54, g: 0.54, b: 0.5, a: 1 }, "metal");
            pushBlock(opaque, cx + 0.14, topY + 0.3, cz, 0.05, 0.08, 0.05, { r: 0.82, g: 0.28, b: 0.22, a: 1 }, "metal");
          }
        }
      }
    }

    const inChunk = (object) => object.x >= startX && object.x < endX && object.y >= startY && object.y < endY;

    const night = isNight(snapshot);
    const clutterPalette = grammarPalette(recipes);
    sceneObjects.buildings.filter(inChunk).forEach((building) => {
      const prefix = zonePrefix(building.zone || building.type) || "r";
      const family = recipes.families[prefix] || recipes.families.r;
      const stage = Math.max(1, Math.min(3, Number(building.stage || building.level || 1) | 0));
      const stageRecipe = recipes.stages[stage] || recipes.stages[1] || { height: 0.5, heightPx: 24 };
      const stateName = normalizeBuildingState(building.state || building.status);
      const stateRecipe = recipes.states[stateName] || recipes.states.normal;
      const footprint = building.footprint || { w: 1, h: 1 };
      const baseX = Math.max(0, Math.min(size - 1, Math.floor(building.x)));
      const baseY = Math.max(0, Math.min(size - 1, Math.floor(building.y)));
      const topY = terrainTopY(snapshot, baseY * size + baseX);
      const variant = Math.max(1, Number(building.variant) || 1);
      const cx = building.x + footprint.w / 2;
      const cz = building.y + footprint.h / 2;
      const decorSeed = assetSeed({ category: "building", zone: prefix, stage, variant });
      const grammar = grammarForZone(recipes, prefix, stage);
      if (grammar) {
        let wallColor = grammarWallColor(recipes, grammar, variant, decorSeed, family.base);
        if (stateName === "declined") wallColor = shade(wallColor, 0.72);
        if (stateName === "recovering") wallColor = shade(wallColor, 0.9);
        if (stateName === "abandoned") wallColor = recipes.paletteColor("abandoned");
        if (night) wallColor = shade(wallColor, 0.55);
        // Construction keeps its walls (the 2D composer only changes the
        // glass and adds scaffold lines); foundation is a slab.
        const wallTile = stateName === "abandoned"
          ? "abandoned"
          : night ? `wall.${prefix}.night` : `wall.${prefix}.day`;
        pushGrammarBuilding(opaque, recipes, clutterPalette, {
          cx, cz, topY, footprint, grammar, variant, night, stateName, wallTile, wallColor,
          heightPx: building.derived && stage > 1
            ? Math.min(stageRecipe.heightPx || 24, 22 + stage * 12)
            : (stageRecipe.heightPx || stageRecipe.height * PX_PER_TILE),
          seed: decorSeed,
          rows: WALL_ROWS[prefix] || 3,
          parapetColor: wallColor,
        });
        return;
      }
      // No grammar loaded (offline fallback recipes): one tinted box with a
      // flat deck, so a city still reads as a city.
      const height = Math.max(0.06, stageRecipe.height * (stateRecipe.heightScale || 1));
      let color = stateRecipe.color || family.base;
      if (!stateRecipe.color) color = shade(color, 1 + ((variant - 1) % 4 - 1.5) * 0.07);
      if (stateRecipe.shade) color = shade(color, stateRecipe.shade);
      const w = footprint.w * 0.92;
      const d = footprint.h * 0.92;
      const wallMaterial = stateName === "abandoned"
        ? "abandoned"
        : stateName === "construction" || stateName === "foundation"
          ? "construction"
          : night ? `wall.${prefix}.night` : `wall.${prefix}.day`;
      pushBlock(opaque, cx, topY + height / 2, cz, w, height, d, color, wallMaterial);
      if (stateName === "normal" || stateName === "recovering") {
        const roofTile = night ? "roof.dark" : "roof.deck";
        pushBlock(opaque, cx, topY + height + 0.02, cz, w * 0.9, 0.04, d * 0.9, night ? shade(family.light, 0.55) : family.light, roofTile);
      }
    });

    sceneObjects.facilities.filter(inChunk).forEach((facility) => {
      const recipe = recipes.facilities[facility.kind] || recipes.facilities.school;
      if (!recipe) return;
      const footprint = facility.footprint || recipe.footprint || { w: 1, h: 1 };
      const baseX = Math.max(0, Math.min(size - 1, Math.floor(facility.x)));
      const baseY = Math.max(0, Math.min(size - 1, Math.floor(facility.y)));
      const topY = terrainTopY(snapshot, baseY * size + baseX);
      if (pushUtilityFacility(opaque, facility,
        facility.x + footprint.w / 2, facility.y + footprint.h / 2,
        topY, footprint, recipe, recipes, night)) return;
      if (pushServiceFacility(opaque, facility,
        facility.x + footprint.w / 2, facility.y + footprint.h / 2,
        topY, footprint, recipe, recipes, night)) return;
      const w = footprint.w * 0.9;
      const d = footprint.h * 0.9;
      const facilityTile = state.textures && state.textures.materials[`facility.${facility.kind}`] ? `facility.${facility.kind}` : "concrete";
      const grammar = recipes.facilityGrammar ? recipes.facilityGrammar[`facility.${facility.kind}`] : null;
      if (grammar) {
        // Plants and services read by silhouette: the same composer, the
        // facility's own tile as the wall, stacks and towers from its
        // clutter list.
        const seed = assetSeed({ category: "facility", kind: facility.kind });
        pushGrammarBuilding(opaque, recipes, clutterPalette, {
          cx: facility.x + footprint.w / 2, cz: facility.y + footprint.h / 2, topY, footprint, grammar,
          variant: 1, night, stateName: "normal", seed,
          // Plants and services wear the 2D composer's base colour on the
          // neutral concrete tile; the dark facility patterns made every
          // plant a black tower.
          wallTile: "concrete",
          wallColor: shade(recipe.base, night ? 0.8 : 1.7),
          heightPx: recipe.heightPx || recipe.height * PX_PER_TILE,
          rows: 2,
          parapetColor: recipe.base,
        });
        return;
      }
      pushBlock(opaque, facility.x + footprint.w / 2, topY + recipe.height / 2, facility.y + footprint.h / 2, w, recipe.height, d, recipe.base, facilityTile);
      pushBlock(opaque, facility.x + footprint.w / 2, topY + recipe.height + 0.02, facility.y + footprint.h / 2, w * 0.85, 0.04, d * 0.85, recipe.light, "metal");
    });

    (sceneObjects.blazeTiles || []).filter(inChunk).forEach((tile) => {
      const topY = terrainTopY(snapshot, tile.y * size + tile.x);
      if (tile.flooded) {
        water.push({
          x: tile.x + 0.5, y: topY + 0.05, z: tile.y + 0.5, sx: 1, sy: 0.1, sz: 1,
          ...recipes.blaze.flood,
          tile: "water",
        });
        return;
      }
      const age = Math.max(1, Number(tile.age) || 1);
      const height = Math.min(0.8, (14 + age * 3) / PX_PER_TILE + 0.12);
      const color = age >= 3 ? recipes.blaze.fireOld : recipes.blaze.fireYoung;
      pushBlock(opaque, tile.x + 0.5, topY + height / 2, tile.y + 0.5, 0.55, height, 0.55, color);
      pushBlock(opaque, tile.x + 0.5, topY + height + 0.05, tile.y + 0.5, 0.28, 0.1, 0.28, recipes.blaze.ember);
    });

    (sceneObjects.catalogTiles || []).filter(inChunk).forEach((tile) => {
      const topY = terrainTopY(snapshot, tile.y * size + tile.x);
      // Bespoke recipe first, then a shared facility recipe, then the
      // category recipe, then the category-tinted block - the same chain
      // the Canvas backend draws.
      const shared = { police: "police", fire: "fire", school: "school", hospital: "clinic", pump: "pump", water_tower: "tower", rail_station: "station" }[tile.label];
      const categoryKey = tile.category === "powerPlant" ? "power_plant" : tile.category;
      const recipe = recipes.catalog[tile.label]
        || (shared ? recipes.facilities[shared] : null)
        || recipes.catalog[categoryKey];
      if (recipe) {
        pushCatalogObject(opaque, { ...tile, night }, tile.x + (tile.footprint?.w || 1) / 2, tile.y + (tile.footprint?.h || 1) / 2, topY, recipe, recipes.catalogCategories[tile.category] || recipes.catalogCategories.infrastructure);
        return;
      }
      const color = recipes.catalogCategories[tile.category] || recipes.catalogCategories.infrastructure;
      pushCatalogObject(opaque, { ...tile, night }, tile.x + (tile.footprint?.w || 1) / 2, tile.y + (tile.footprint?.h || 1) / 2, topY, null, color);
    });

    return { opaque, water, tint };
  }

  // Decorative agents ride the snapshot's derived agent facts. Position and
  // phase come from the core's deterministic derivation; this collector only
  // shapes and colors them.
  function collectAgentBlocks(snapshot, recipes) {
    const size = mapSize(snapshot);
    const opaque = [];
    const smoke = [];
    const agents = snapshot?.agents && typeof snapshot.agents === "object" ? snapshot.agents : null;
    if (!agents) return { opaque, smoke };
    const topAt = (agent) => {
      const tileX = Math.max(0, Math.min(size - 1, Math.floor(agent.x)));
      const tileY = Math.max(0, Math.min(size - 1, Math.floor(agent.y)));
      const index = tileY * size + tileX;
      const ground = terrainTopY(snapshot, index);
      // Traffic on the elevated highway rides the deck, not the ground
      // under it.
      if (gridValue(snapshot, ["highway"], index, false)) return ground + 0.35;
      return ground;
    };
    const place = (list, palette, sizeX, sizeY, sizeZ, lift = 0) => {
      (Array.isArray(list) ? list : []).forEach((agent, index) => {
        if (!Number.isFinite(agent?.x) || !Number.isFinite(agent?.y)) return;
        const phase = (Number(agent.phase) || 0) - 0.5;
        const color = palette[index % palette.length];
        pushBlock(
          opaque,
          agent.x + 0.5 + phase * 0.5, topAt(agent) + sizeY / 2 + lift, agent.y + 0.5 + phase * 0.18,
          sizeX, sizeY, sizeZ, color
        );
      });
    };
    // A car is roughly 1.8×4.3 m on the 16 m tile, with a low body and cabin.
    place(agents.vehicles, recipes.agents.car, 0.112, 0.065, 0.27, 0.035);
    // A darker cabin block on top of each car body makes vehicles read as
    // cars from above, the way SC2000's two-tone sprites do.
    (Array.isArray(agents.vehicles) ? agents.vehicles : []).forEach((agent, index) => {
      if (!Number.isFinite(agent?.x) || !Number.isFinite(agent?.y)) return;
      const phase = (Number(agent.phase) || 0) - 0.5;
      const cabin = recipes.agents.car[(index + 1) % recipes.agents.car.length];
      pushBlock(
        opaque,
        agent.x + 0.5 + phase * 0.5, topAt(agent) + 0.24, agent.y + 0.5 + phase * 0.18,
        0.075, 0.04, 0.13, shade(cabin, 0.82), "metal"
      );
    });
    // Pedestrians are about 1.7 m tall, never tower over a house.
    place(agents.pedestrians, recipes.agents.pedestrian, 0.028, 0.105, 0.028, 0.02);
    place(agents.trains, recipes.agents.train, 0.4, 0.3, 0.88, 0.08);
    place(agents.serviceVehicles, recipes.agents.service, 0.34, 0.18, 0.52, 0.06);
    (Array.isArray(agents.smoke) ? agents.smoke : []).forEach((agent, index) => {
      if (!Number.isFinite(agent?.x) || !Number.isFinite(agent?.y)) return;
      const phase = Number(agent.phase) || 0;
      const color = recipes.agents.smoke[index % recipes.agents.smoke.length];
      const scale = 0.22 + phase * 0.18;
      smoke.push({
        x: agent.x + 0.5, y: topAt(agent) + 1.4 + phase * 0.9, z: agent.y + 0.5,
        sx: scale, sy: scale, sz: scale,
        r: color.r, g: color.g, b: color.b, a: 0.5 - phase * 0.3,
      });
    });
    // Moving things ride above the map: aircraft at their record height,
    // boats on the water line. Orientation follows the thing's direction.
    (Array.isArray(snapshot?.things) ? snapshot.things : []).forEach((thing) => {
      if (!Number.isFinite(thing?.x) || !Number.isFinite(thing?.y)) return;
      const along = (Number(thing.dir) || 0) % 2 === 1;
      const baseY = topAt(thing) + (Number(thing.z) || 0) * 0.35;
      if (thing.kind === "airplane") {
        pushBlock(opaque, thing.x + 0.5, baseY + 0.12, thing.y + 0.5, along ? 0.7 : 0.22, 0.1, along ? 0.22 : 0.7, recipes.things.airplane);
        pushBlock(opaque, thing.x + 0.5, baseY + 0.18, thing.y + 0.5, along ? 0.24 : 0.6, 0.08, along ? 0.6 : 0.24, recipes.things.airplane);
      } else if (thing.kind === "helicopter") {
        pushBlock(opaque, thing.x + 0.5, baseY + 0.12, thing.y + 0.5, 0.3, 0.16, 0.3, recipes.things.helicopter);
      } else {
        pushBlock(opaque, thing.x + 0.5, baseY + 0.08, thing.y + 0.5, along ? 0.7 : 0.34, 0.16, along ? 0.34 : 0.7, recipes.things.hull);
        if (thing.kind === "sailboat") pushBlock(opaque, thing.x + 0.5, baseY + 0.36, thing.y + 0.5, 0.06, 0.4, 0.06, recipes.things.top);
        else pushBlock(opaque, thing.x + 0.5, baseY + 0.23, thing.y + 0.5, 0.28, 0.14, 0.2, recipes.things.top);
      }
    });

    // Waterfalls: white falling curtains on the water side of high edges,
    // with a splash at the foot. The tick sways the curtain so the per-tick
    // agents redraw animates it.
    const tick = Number(snapshot.tick) | 0;
    waterfallEdges(snapshot).forEach((edge, index) => {
      const cx = edge.x + 0.5;
      const cz = edge.y + 0.5;
      const base = terrainTopY(snapshot, edge.y * size + edge.x);
      const top = base + edge.height * ALT_STEP;
      const fall = { r: 0.86, g: 0.94, b: 1, a: 1 };
      const sway = Math.sin((tick + index * 3) * 0.4) * 0.04;
      const ox = edge.dir === "e" ? 0.44 : edge.dir === "w" ? -0.44 : edge.dir === "n" ? -0.14 : 0.14;
      const oz = edge.dir === "s" ? 0.44 : edge.dir === "n" ? -0.44 : edge.dir === "e" ? 0.14 : -0.14;
      let y = base + 0.08;
      while (y < top - 0.05) {
        pushBlock(opaque, cx + ox + (edge.dir === "e" || edge.dir === "w" ? 0 : sway), y, cz + oz + (edge.dir === "n" || edge.dir === "s" ? 0 : sway), 0.12, 0.16, 0.12, fall);
        y += 0.16;
      }
      pushBlock(opaque, cx, base + 0.04, cz, 0.6, 0.06, 0.6, { r: 0.94, g: 0.98, b: 1, a: 1 });
    });

    // Construction cranes: a mast and a swinging jib over every construction
    // tile, animated purely from the tick (SC2000 construction life).
    for (let index = 0; index < size * size; index += 1) {
      if (Number(gridValue(snapshot, ["buildingState"], index, 0)) !== 2) continue;
      const cx = (index % size) + 0.5;
      const cz = Math.floor(index / size) + 0.5;
      const base = terrainTopY(snapshot, index);
      const sway = Math.sin((tick + index * 7) * 0.45) * 0.09;
      pushBlock(opaque, cx, base + 0.36, cz, 0.06, 0.72, 0.06, { r: 0.78, g: 0.63, b: 0.24, a: 1 }, "metal");
      pushBlock(opaque, cx + 0.26 + sway * 0.6, base + 0.63, cz, 0.32, 0.06, 0.06, { r: 0.78, g: 0.63, b: 0.24, a: 1 }, "metal");
    }

    // Spring sakura petals: tiny pink flakes drift from blossom trees, a
    // gentle deterministic fall that stays sparse for the zen cleanliness.
    const season = Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375);
    if (season === 0) {
      for (let index = 0; index < size * size; index += 1) {
        if (!isTree(snapshot, index)) continue;
        if (hashTile(index * 29) % 3 !== 0) continue; // blossom trees only
        const cx = (index % size) + 0.5;
        const cz = Math.floor(index / size) + 0.5;
        const base = terrainTopY(snapshot, index);
        for (let petal = 0; petal < 2; petal += 1) {
          const phase = (tick + index * 5 + petal * 17) % 40;
          const driftX = ((phase % 8) - 3) * 0.06;
          const driftY = phase * 0.02;
          pushBlock(opaque, cx + driftX, base + 0.7 + driftY, cz + 0.2, 0.05, 0.02, 0.04, { r: 0.96, g: 0.8, b: 0.8, a: 1 });
        }
      }
    }

    // Active tornado and monster disasters: a swaying funnel with a dust ring,
    // and a hulking dark body with red eyes.
    const disaster = snapshot.disaster;
    if (disaster && (disaster.kind === "tornado" || disaster.kind === "monster") && Number.isFinite(disaster.x) && Number.isFinite(disaster.y)) {
      const cx = disaster.x + 0.5;
      const cz = disaster.y + 0.5;
      const base = terrainTopY(snapshot, Math.max(0, Math.min(size - 1, disaster.y)) * size + Math.max(0, Math.min(size - 1, disaster.x)));
      if (disaster.kind === "tornado") {
        const sway = Math.sin(tick * 0.35) * 0.08;
        const tiers = [[0.72, 0.5], [0.52, 0.45], [0.34, 0.4], [0.2, 0.35]];
        tiers.forEach(([width, height], tierIndex) => {
          pushBlock(opaque, cx + sway * tierIndex, base + 0.3 + tierIndex * 0.42, cz - sway * tierIndex, width, height, width,
            tierIndex === tiers.length - 1 ? { r: 0.93, g: 0.93, b: 0.9, a: 1 } : { r: 0.52, g: 0.52, b: 0.52, a: 1 });
        });
        pushBlock(opaque, cx, base + 0.08, cz, 1.1, 0.12, 1.1, { r: 0.7, g: 0.62, b: 0.5, a: 1 });
      } else {
        pushBlock(opaque, cx, base + 0.7, cz, 0.85, 1.4, 0.85, { r: 0.2, g: 0.24, b: 0.2, a: 1 });
        pushBlock(opaque, cx + 0.24, base + 0.95, cz + 0.36, 0.1, 0.1, 0.06, { r: 1, g: 0.28, b: 0.2, a: 1 });
        pushBlock(opaque, cx - 0.24, base + 0.95, cz + 0.36, 0.1, 0.1, 0.06, { r: 1, g: 0.28, b: 0.2, a: 1 });
      }
    }
    return { opaque, smoke };
  }

  function collectOverlayBlocks(snapshot, overlay) {
    const normalized = normalizeOverlay(overlay);
    const blocks = [];
    if (normalized === "none") return blocks;
    const size = mapSize(snapshot);
    for (let index = 0; index < size * size; index += 1) {
      if (isWater(snapshot, index)) continue;
      const bucket = overlayBucket(normalized, overlayValue(snapshot, normalized, index));
      const color = overlayColor(normalized, bucket);
      const x = index % size;
      const y = Math.floor(index / size);
      blocks.push({
        x: x + 0.5, y: terrainTopY(snapshot, index) + 0.06, z: y + 0.5, sx: 0.98, sy: 0.02, sz: 0.98,
        r: color.r, g: color.g, b: color.b, a: color.a,
      });
    }
    return blocks;
  }

  function previewTiles(preview) {
    if (!preview) return [];
    if (Array.isArray(preview.footprint)) return preview.footprint;
    if (Array.isArray(preview.footprint?.tiles)) return preview.footprint.tiles;
    if (preview.footprint && Number.isFinite(preview.footprint.x) && Number.isFinite(preview.footprint.y)) {
      const area = preview.footprint;
      const tiles = [];
      const width = Math.max(1, Number(area.w || area.width) | 0);
      const height = Math.max(1, Number(area.h || area.height) | 0);
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) tiles.push({ x: area.x + x, y: area.y + y });
      return tiles;
    }
    if (Number.isFinite(preview.x) && Number.isFinite(preview.y)) return [{ x: preview.x, y: preview.y }];
    return [];
  }

  function collectPreviewBlocks(preview, snapshot, recipes) {
    const blocks = [];
    if (!preview || !snapshot) return blocks;
    const size = mapSize(snapshot);
    const accepted = preview.accepted !== false;
    const color = accepted ? recipes.preview.accepted : recipes.preview.rejected;
    previewTiles(preview).forEach((tile) => {
      const x = Math.floor(tile.x);
      const y = Math.floor(tile.y);
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      blocks.push({
        x: x + 0.5, y: terrainTopY(snapshot, y * size + x) + 0.1, z: y + 0.5, sx: 1, sy: 0.08, sz: 1,
        r: color.r, g: color.g, b: color.b, a: color.a,
      });
    });
    return blocks;
  }

  // A pure ledger so dispose can prove every GPU resource was released. The
  // acceptance gate asserts zero survivors after close.
  function createResourceLedger() {
    const outstanding = new Set();
    return {
      track(resource) {
        if (resource) outstanding.add(resource);
        return resource;
      },
      release(resource) {
        if (!outstanding.has(resource)) return false;
        outstanding.delete(resource);
        return true;
      },
      drain(disposeOne) {
        outstanding.forEach((resource) => {
          if (typeof disposeOne === "function") disposeOne(resource);
        });
        outstanding.clear();
      },
      count() {
        return outstanding.size;
      },
    };
  }

  // Asset identity, independent of placement, camera direction and light.
  // Runtime instances and offline sprites therefore share one silhouette.
  function assetSeed(frame) {
    const key = frame.category === "building"
      ? `building:${zonePrefix(frame.zone) || "r"}:${frame.stage || 1}:${frame.variant || 1}`
      : `${frame.category}:${frame.kind || String(frame.id || "").replace(/\.night$/, "").split(".").pop()}`;
    let value = 2166136261;
    for (let index = 0; index < key.length; index += 1) value = Math.imul(value ^ key.charCodeAt(index), 16777619);
    return hashTile(value >>> 0);
  }

  function createAssetBlocks(frame, source) {
    const recipes = buildRecipes(source);
    const footprint = normalizeFootprint(frame.footprint || [1, 1]);
    const snapshot = { size: 16, tick: 500, timeOfDay: frame.state === "night" ? 0 : 0.5 };
    const scene = { buildings: [], facilities: [], catalogTiles: [], covered: new Set() };
    let centerX = footprint.w / 2;
    let centerZ = footprint.h / 2;
    let blocks;
    if (frame.category === "building") {
      scene.buildings.push({ ...frame, x: 0, y: 0, footprint, state: frame.state === "night" ? "normal" : frame.state });
    } else if (frame.category === "facility") {
      scene.facilities.push({ x: 0, y: 0, footprint, kind: frame.id.replace(/\.night$/, "").split(".").pop() });
    } else if (frame.category === "catalog") {
      scene.catalogTiles.push({ x: 0, y: 0, label: frame.id.replace(/\.night$/, "").split(".").pop(), category: frame.kind, footprint });
    } else if (frame.category === "agent") {
      const key = { car: "vehicles", pedestrian: "pedestrians", train: "trains", service: "serviceVehicles", smoke: "smoke" }[frame.kind];
      if (!key) return null;
      const palettes = { car: "car", pedestrian: "pedestrian", train: "train", service: "service", smoke: "smoke" };
      const colors = recipes.agents[palettes[frame.kind]];
      if (colors) recipes.agents[palettes[frame.kind]] = [colors[((frame.variant || 1) - 1) % colors.length]];
      snapshot.agents = { [key]: [{ x: 0, y: 0, phase: frame.kind === "smoke" ? ((frame.variant || 1) - 1) / 3 : 0.5 }] };
      const result = collectAgentBlocks(snapshot, recipes);
      blocks = [...result.opaque, ...result.smoke];
      centerX = centerZ = 0.5;
    } else if (frame.kind === "tree") {
      const desiredKind = frame.variant <= 3 ? frame.variant : 1;
      let index = 0;
      for (; index < 256; index += 1) {
        if (1 + hashTile(index) % 3 !== desiredKind) continue;
        if (frame.id === "tree.blossom" && hashTile(index * 29) % 8 !== 0) continue;
        if (frame.id === "tree.maple" && hashTile(index * 13) % 2 !== 0) continue;
        break;
      }
      snapshot.tick = frame.id === "tree.winter" ? 1200 : frame.id === "tree.maple" ? 800 : frame.id === "tree.blossom" ? 100 : 500;
      snapshot.tree = { [index]: true };
      const result = collectChunkBlocks(snapshot, recipes, 0, 0, scene);
      blocks = result.opaque.filter((block) => String(block.tile).startsWith("tree."));
      centerX = index % 16 + 0.5;
      centerZ = Math.floor(index / 16) + 0.5;
    } else return null;
    if (!blocks) {
      const result = collectChunkBlocks(snapshot, recipes, 0, 0, scene, true);
      blocks = [...result.opaque, ...result.water, ...result.tint];
    }
    return blocks.map((block) => ({ ...block, x: block.x - centerX, z: block.z - centerZ }));
  }


  const PURE = Object.freeze({
    TILE_METERS,
    measureParcelPlan,
    plannedBuildingMasses,
    assetSeed,
    createAssetBlocks,
    blockFaces,
    PX_PER_WORLD_Y,
    measureFrame,
    shadowMapSizeFor,
    pxToWorld,
    buildingMasses,
    tileCropFraction,
    tileMaterialId,
    ALT_STEP,
    PX_PER_TILE,
    MIN_ZOOM,
    MAX_ZOOM,
    DEFAULT_ZOOM,
    ROTATIONS,
    clampZoom,
    normalizeRotation,
    mapSize,
    gridValue,
    altitudeAt,
    maxAltitude,
    isWater,
    isRoad,
    isWire,
    isRail,
    isPipe,
    isPark,
    isTree,
    terrainKindAt,
    zonePrefix,
    normalizeBuildingState,
    normalizeFootprint,
    normalizeFacilityKind,
    normalizeOverlay,
    overlayValue,
    overlayBucket,
    overlayColor,
    buildRecipes,
    collectSceneObjects,
    chunkSignature,
    collectChunkBlocks,
    collectAgentBlocks,
    collectOverlayBlocks,
    previewTiles,
    collectPreviewBlocks,
    cameraRig,
    projectPoint,
    unprojectGround,
    tileFromScreen,
    panToCenter,
    lightingFor,
    waterBob,
    hashTile,
    waterfallEdges,
    cliffEdges,
    createResourceLedger,
  });

  // --- live renderer state ----------------------------------------------------

  let threePromise = null;

  function loadThree() {
    if (!threePromise) threePromise = import(VENDOR_URL);
    return threePromise;
  }

  function webglUnavailableError(reason) {
    const error = new Error(`${WEBGL_UNAVAILABLE_CODE}: ${reason}`);
    error.name = "BonsaiVoxelUnavailableError";
    error.code = WEBGL_UNAVAILABLE_CODE;
    return error;
  }

  const state = {
    mounted: false,
    ready: false,
    disposed: false,
    THREE: null,
    stack: null,
    canvas: null,
    createdCanvas: false,
    renderer: null,
    scene: null,
    camera: null,
    ambient: null,
    sun: null,
    fill: null,
    staticGroup: null,
    dynamicGroup: null,
    sharedGeometry: null,
    materials: null,
    textures: null,
    texture: null,
    texturedMaterial: null,
    wallMaterial: null,
    waterTexture: null,
    tileGeometries: new Map(),
    recipes: buildRecipes(null),
    recipeRev: 0,
    observer: null,
    contextLostHandler: null,
    contextLost: false,
    cssWidth: 0,
    cssHeight: 0,
    dpr: 1,
    snapshot: null,
    preview: null,
    previewRevision: 0,
    overlay: "none",
    view: { zoom: DEFAULT_ZOOM, rotation: 0, panX: 0, panY: 0 },
    chunks: new Map(),
    chunkBuildCount: 0,
    dynamicMeshes: { agents: null, smoke: null, overlay: null, preview: null },
    lastKeys: {},
    activeRaf: 0,
    instanceCount: 0,
    // First-30-frame budget probe: if the median render is slow, the shadow
    // map halves once and stays halved for this mount.
    frameSamples: [],
    shadowReduced: false,
    ledger: createResourceLedger(),
  };

  function isCanvasElement(node) {
    return Boolean(node && String(node.tagName || "").toLowerCase() === "canvas");
  }

  function resolveStack(target) {
    if (!target) throw new Error("bonsai-voxel-mount-target");
    if (!isCanvasElement(target)) return target;
    if (typeof target.closest === "function") {
      const owned = target.closest("[data-bonsai-map-stack]");
      if (owned) return owned;
    }
    return target.parentElement || target;
  }

  function containerRect() {
    if (!state.stack || typeof state.stack.getBoundingClientRect !== "function") return { width: 1, height: 1 };
    const rect = state.stack.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  function requestedDpr(value) {
    if (Number.isFinite(value) && value > 0) return Math.min(2, value);
    const globalDpr = Number(window.devicePixelRatio);
    return Number.isFinite(globalDpr) && globalDpr > 0 ? Math.min(2, globalDpr) : 1;
  }

  function scheduleRender() {
    if (!state.snapshot || state.activeRaf || state.disposed || !state.ready) return;
    if (typeof requestAnimationFrame !== "function") {
      render(state.snapshot);
      return;
    }
    state.activeRaf = requestAnimationFrame(() => {
      state.activeRaf = 0;
      if (!state.disposed && state.snapshot) render(state.snapshot);
    });
  }

  function observeContainer() {
    if (state.observer || typeof ResizeObserver !== "function" || !state.stack) return;
    state.observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === state.stack) || entries[0];
      if (!entry || !entry.contentRect) return;
      resize(entry.contentRect.width, entry.contentRect.height);
    });
    state.observer.observe(state.stack);
  }

  async function loadRecipeSource() {
    if (typeof fetch !== "function") return null;
    try {
      const response = await fetch(RECIPE_URL);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async function loadTextureAssets() {
    if (typeof fetch !== "function" || typeof Image !== "function") return null;
    try {
      const response = await fetch(TEXTURES_URL);
      if (!response.ok) return null;
      const manifest = await response.json();
      if (!manifest || !manifest.png || !manifest.tiles || !manifest.materials || !manifest.atlas) return null;
      const loadImage = (url) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
      const [image, maskImage] = await Promise.all([
        loadImage(manifest.png.url || TEXTURES_IMAGE_URL),
        manifest.masks ? loadImage(manifest.masks.url) : Promise.resolve(null),
      ]);
      if (!image || (manifest.masks && !maskImage)) return null;
      return { manifest, image, maskImage };
    } catch {
      return null;
    }
  }

  // V2 walls keep colour opacity separate from linear glass/emission masks.
  // A missing mask texture supports existing v1 atlases during migration.
  // This material multiplies the instance colour into wall pixels only and
  // paints the glass from a uniform, so one tile serves every wall colour,
  // and at night the glass glows from the same uniform pair.
  function createWallMaterial(THREE, texture, maskTexture = null) {
    const material = new THREE.MeshLambertMaterial({ map: texture, color: 0xffffff });
    const uniforms = {
      uMaterialMask: { value: maskTexture },
      uGlassColor: { value: new THREE.Color(0.48, 0.62, 0.71) },
      uGlassGlow: { value: new THREE.Color(0, 0, 0) },
    };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uMaterialMask = uniforms.uMaterialMask;
      shader.uniforms.uGlassColor = uniforms.uGlassColor;
      shader.uniforms.uGlassGlow = uniforms.uGlassGlow;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uGlassColor;\nuniform vec3 uGlassGlow;\nuniform sampler2D uMaterialMask;\nvec4 bonsaiWallTexel;\nvec2 bonsaiMaterialMask;")
        .replace("#include <map_fragment>", [
          "bonsaiWallTexel = texture2D( map, vMapUv );",
          maskTexture ? "bonsaiMaterialMask = texture2D( uMaterialMask, vMapUv ).rg;" : "bonsaiMaterialMask = vec2( 1.0 - bonsaiWallTexel.a );",
          // Three defines USE_INSTANCING_COLOR only in the vertex shader;
          // its fragment stage exposes the interpolated tint as USE_COLOR.
          "#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )",
          "vec3 bonsaiWall = bonsaiWallTexel.rgb * vColor.rgb;",
          "#else",
          "vec3 bonsaiWall = bonsaiWallTexel.rgb;",
          "#endif",
          "diffuseColor.rgb *= mix( bonsaiWallTexel.rgb * uGlassColor, bonsaiWall, 1.0 - bonsaiMaterialMask.r );",
          "diffuseColor.a = 1.0;",
        ].join("\n"))
        .replace("#include <color_fragment>", "")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlassGlow * bonsaiWallTexel.rgb * bonsaiMaterialMask.g;");
    };
    material.customProgramCacheKey = () => maskTexture ? "bonsai-wall-v2" : "bonsai-wall-v1";
    material.userData.uniforms = uniforms;
    return material;
  }

  function createMaterials(THREE) {
    const opaque = state.ledger.track(new THREE.MeshLambertMaterial({ color: 0xffffff }));
    const water = state.ledger.track(new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false,
    }));
    const tint = state.ledger.track(new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false,
    }));
    const smoke = state.ledger.track(new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false,
    }));
    const preview = state.ledger.track(new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false,
    }));
    return { opaque, water, tint, smoke, preview, textured: state.texturedMaterial || opaque };
  }

  // shadows: "both" for solid blocks (cast and receive), "receive" for the
  // water surface, "none" for tints, overlays, previews, and smoke.
  function buildInstancedMesh(blocks, material, renderOrder = 0, geometry = state.sharedGeometry, shadows = "none") {
    if (!blocks.length) return null;
    const THREE = state.THREE;
    const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
    mesh.castShadow = shadows === "both";
    mesh.receiveShadow = shadows === "both" || shadows === "receive";
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    blocks.forEach((block, index) => {
      matrix.makeScale(block.sx, block.sy, block.sz);
      matrix.setPosition(block.x, block.y, block.z);
      mesh.setMatrixAt(index, matrix);
      // Palette values are sRGB measurements. three r152+ reads bare setRGB
      // components in the linear working space, so feeding them unconverted
      // re-encoded every block brighter and the whole city washed to pastel.
      color.setRGB(block.r, block.g, block.b, THREE.SRGBColorSpace);
      const tileId = tileMaterialId(block.tile || "");
      const materialDefinition = state.textures?.materials[tileId];
      const mean = state.textures?.tiles[materialDefinition?.top || tileId]?.meanColor;
      if (mean && !tileId.startsWith("wall.") && tileId !== "facility.school") {
        // The descriptor already carries the chosen surface colour. Remove
        // the atlas base tint before multiplying, retaining its actual detail.
        const linear = (value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
        color.r /= Math.max(.015, linear(mean[0] / 255));
        color.g /= Math.max(.015, linear(mean[1] / 255));
        color.b /= Math.max(.015, linear(mean[2] / 255));
      }
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.renderOrder = renderOrder;
    state.ledger.track(mesh);
    state.instanceCount += blocks.length;
    return mesh;
  }

  // One BoxGeometry per texture material, with per-face UVs resolved from
  // the texture manifest. The top face samples the material's top tile, the
  // four sides its side tile, with texture v=0 at the top edge so wall
  // windows stay upright. Geometries are cached per material id and disposed
  // with the renderer.
  // A tile key may carry a crop suffix "material#k/rows": the side faces
  // then show only the top k of rows storey bands, for the last block of a
  // wall column whose height ends between whole units.
  function tileMaterialId(key) {
    return String(key).split("#")[0];
  }

  function tileCropFraction(key) {
    const crop = String(key).split("#")[1];
    if (!crop) return 1;
    const [k, rows] = crop.split("/").map(Number);
    if (!(k > 0) || !(rows > 0) || k > rows) return 1;
    return k / rows;
  }

  function tileGeometry(THREE, key, shape = "box") {
    const material = state.textures?.materials[tileMaterialId(key)];
    const topRect = material && state.textures.tiles[material.top];
    const sideRect = material && state.textures.tiles[material.side];
    const cacheKey = `${key || "flat"}:${shape}`;
    if (shape === "box" && (!topRect || !sideRect)) return state.sharedGeometry;
    const cached = state.tileGeometries.get(cacheKey);
    if (cached) return cached;
    const fraction = tileCropFraction(key);
    if (shape !== "box") {
      const geometry = new THREE.BufferGeometry();
      const positions = [], normals = [], coordinates = [];
      const faces = blockFaces({ x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, shape });
      faces.forEach((face) => {
        const rect = face.surface === "top" ? topRect : sideRect;
        for (let i = 1; i < face.vertices.length - 1; i += 1) {
          for (const j of [0, i, i + 1]) {
            positions.push(...face.vertices[j]);
            normals.push(...face.normal);
            const [u,v] = face.uv[j];
            coordinates.push(rect ? (rect.x + .5 + u * (rect.w - 1)) / state.textures.atlas.width : u,
              rect ? (rect.y + .5 + v * (rect.h - 1)) / state.textures.atlas.height : v);
          }
        }
      });
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(coordinates, 2));
      state.tileGeometries.set(cacheKey, geometry);
      state.ledger.track(geometry);
      return geometry;
    }
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const atlasWidth = state.textures.atlas.width;
    const atlasHeight = state.textures.atlas.height;
    const uv = geometry.attributes.uv.array;
    const setFace = (face, rect, crop = 1) => {
      const u0 = (rect.x + 0.5) / atlasWidth;
      const u1 = (rect.x + rect.w - 0.5) / atlasWidth;
      const vt = (rect.y + 0.5) / atlasHeight;
      const vb = (rect.y + Math.max(1, rect.h * crop) - 0.5) / atlasHeight;
      const o = face * 8;
      uv[o] = u0; uv[o + 1] = vb;
      uv[o + 2] = u1; uv[o + 3] = vb;
      uv[o + 4] = u0; uv[o + 5] = vt;
      uv[o + 6] = u1; uv[o + 7] = vt;
    };
    setFace(0, sideRect, fraction);
    setFace(1, sideRect, fraction);
    setFace(2, topRect);
    setFace(3, sideRect);
    setFace(4, sideRect, fraction);
    setFace(5, sideRect, fraction);
    geometry.attributes.uv.needsUpdate = true;
    state.tileGeometries.set(cacheKey, geometry);
    state.ledger.track(geometry);
    return geometry;
  }

  // Flat blocks (no texture material) keep the single opaque material; the
  // rest group by material id, one InstancedMesh per id so each group gets
  // the UV geometry its texture needs.
  function buildChunkMeshes(blocks) {
    const meshes = [];
    const flat = [];
    const byTile = new Map();
    blocks.forEach((block) => {
      if ((!block.tile || !state.textures || !state.textures.materials[tileMaterialId(block.tile)]) && (!block.shape || block.shape === "box")) {
        flat.push(block);
        return;
      }
      const key = `${block.tile || "flat"}:${block.shape || "box"}`;
      let group = byTile.get(key);
      if (!group) {
        group = [];
        byTile.set(key, group);
      }
      group.push(block);
    });
    const flatMesh = buildInstancedMesh(flat, state.materials.opaque, 0, state.sharedGeometry, "both");
    if (flatMesh) meshes.push(flatMesh);
    byTile.forEach((group) => {
      const tile = group[0].tile;
      const shape = group[0].shape || "box";
      const textured = tile && state.textures?.materials[tileMaterialId(tile)];
      const material = !textured ? state.materials.opaque : state.wallMaterial && (tileMaterialId(tile).startsWith("wall.") || tileMaterialId(tile) === "facility.school") ? state.wallMaterial : state.materials.textured;
      const mesh = buildInstancedMesh(group, material, 0, tileGeometry(state.THREE, tile, shape), "both");
      if (mesh) {
        mesh.userData.tileKey = tile;
        meshes.push(mesh);
      }
    });
    return meshes;
  }

  function disposeMesh(mesh) {
    if (!mesh) return;
    if (mesh.parent) mesh.parent.remove(mesh);
    if (mesh.count !== undefined) state.instanceCount -= mesh.count;
    state.ledger.release(mesh);
    if (typeof mesh.dispose === "function") mesh.dispose();
  }

  function disposeChunkRecord(record) {
    if (!record) return;
    (record.meshes || []).forEach(disposeMesh);
  }

  function rebuildChunk(snapshot, sceneObjects, chunkX, chunkY, signature) {
    const key = `${chunkX}:${chunkY}`;
    disposeChunkRecord(state.chunks.get(key));
    const blocks = collectChunkBlocks(snapshot, state.recipes, chunkX, chunkY, sceneObjects);
    const meshes = [];
    const opaqueMeshes = buildChunkMeshes(blocks.opaque);
    const water = buildInstancedMesh(blocks.water, state.materials.waterTextured || state.materials.water, 1, state.sharedGeometry, "receive");
    const tint = buildInstancedMesh(blocks.tint, state.materials.tint, 2);
    [...opaqueMeshes, water, tint].forEach((mesh) => {
      if (!mesh) return;
      state.staticGroup.add(mesh);
      meshes.push(mesh);
    });
    state.chunks.set(key, { signature, meshes, waterMesh: water, recipeRev: state.recipeRev });
    state.chunkBuildCount += 1;
  }

  function syncStaticChunks(snapshot, sceneObjects) {
    const size = mapSize(snapshot);
    const chunksPerSide = Math.ceil(size / CHUNK_SIZE);
    const seen = new Set();
    for (let chunkY = 0; chunkY < chunksPerSide; chunkY += 1) {
      for (let chunkX = 0; chunkX < chunksPerSide; chunkX += 1) {
        const key = `${chunkX}:${chunkY}`;
        seen.add(key);
        const signature = chunkSignature(snapshot, chunkX, chunkY, sceneObjects);
        const record = state.chunks.get(key);
        if (record && record.signature === signature && record.recipeRev === state.recipeRev) continue;
        rebuildChunk(snapshot, sceneObjects, chunkX, chunkY, signature);
      }
    }
    [...state.chunks.keys()].forEach((key) => {
      if (seen.has(key)) return;
      disposeChunkRecord(state.chunks.get(key));
      state.chunks.delete(key);
    });
  }

  function syncDynamic(snapshot) {
    const agentsKey = `${Number(snapshot.tick) | 0}:${snapshot.rev ?? "x"}:${state.recipeRev}`;
    if (state.lastKeys.agents !== agentsKey) {
      state.lastKeys.agents = agentsKey;
      disposeMesh(state.dynamicMeshes.agents);
      disposeMesh(state.dynamicMeshes.smoke);
      const blocks = collectAgentBlocks(snapshot, state.recipes);
      state.dynamicMeshes.agents = buildInstancedMesh(blocks.opaque, state.materials.opaque, 0, state.sharedGeometry, "both");
      state.dynamicMeshes.smoke = buildInstancedMesh(blocks.smoke, state.materials.smoke, 3);
      [state.dynamicMeshes.agents, state.dynamicMeshes.smoke].forEach((mesh) => {
        if (mesh) state.dynamicGroup.add(mesh);
      });
    }

    const overlayKey = `${state.overlay}:${snapshot.rev ?? "x"}:${Number(snapshot.tick) | 0}`;
    if (state.lastKeys.overlay !== overlayKey) {
      state.lastKeys.overlay = overlayKey;
      disposeMesh(state.dynamicMeshes.overlay);
      state.dynamicMeshes.overlay = buildInstancedMesh(collectOverlayBlocks(snapshot, state.overlay), state.materials.tint, 2);
      if (state.dynamicMeshes.overlay) state.dynamicGroup.add(state.dynamicMeshes.overlay);
    }

    const previewKey = `${state.previewRevision}:${snapshot.rev ?? "x"}`;
    if (state.lastKeys.preview !== previewKey) {
      state.lastKeys.preview = previewKey;
      disposeMesh(state.dynamicMeshes.preview);
      state.dynamicMeshes.preview = buildInstancedMesh(collectPreviewBlocks(state.preview, snapshot, state.recipes), state.materials.preview, 4);
      if (state.dynamicMeshes.preview) state.dynamicGroup.add(state.dynamicMeshes.preview);
    }
  }

  // The visible ground as a radius around the camera target: half the view
  // width along the screen x axis, the full view height along the ground
  // (the 30-degree camera foreshortens ground depth by one half).
  function visibleGroundRadius(view, cssWidth, cssHeight) {
    const scale = pixelsPerWorldUnit(view.zoom);
    const halfW = Math.max(1, cssWidth) / (2 * scale);
    const halfU = Math.max(1, cssHeight) / scale;
    return Math.sqrt(halfW * halfW + halfU * halfU) + 4;
  }

  function syncLighting(snapshot) {
    const light = lightingFor(snapshot.timeOfDay);
    const size = mapSize(snapshot);
    const target = cameraTarget(state.view, size);
    const length = Math.hypot(light.sunX, light.sunY, light.sunZ) || 1;
    state.sun.position.set(
      target.x + (light.sunX / length) * SUN_DISTANCE,
      (light.sunY / length) * SUN_DISTANCE,
      target.z + (light.sunZ / length) * SUN_DISTANCE
    );
    state.sun.target.position.set(target.x, 0, target.z);
    state.sun.target.updateMatrixWorld();
    const radius = Math.min(size + 8, visibleGroundRadius(state.view, state.cssWidth, state.cssHeight));
    const shadowCamera = state.sun.shadow.camera;
    if (shadowCamera.right !== radius) {
      shadowCamera.left = -radius;
      shadowCamera.right = radius;
      shadowCamera.top = radius;
      shadowCamera.bottom = -radius;
      shadowCamera.updateProjectionMatrix();
    }
    state.sun.intensity = light.sunIntensity;
    state.ambient.intensity = light.ambientIntensity;
    if (state.fill) {
      state.fill.position.set(-light.sunX, 0.6, -light.sunZ);
      state.fill.intensity = 0.12 + light.dayFactor * 0.3;
    }
    if (state.wallMaterial) {
      // Glass: daylight blue-grey by day, warm lit windows as the day
      // factor falls; the glow is what makes the night skyline.
      const uniforms = state.wallMaterial.userData.uniforms;
      const glass = state.recipes.paletteColor("glass");
      const lit = state.recipes.paletteColor("windowNight", "yellow");
      const nightMix = Math.max(0, Math.min(1, (0.6 - light.dayFactor) / 0.45));
      const mix = (a, b) => a + (b - a) * nightMix;
      uniforms.uGlassColor.value.setRGB(mix(glass.r, lit.r), mix(glass.g, lit.g), mix(glass.b, lit.b), state.THREE.SRGBColorSpace);
      uniforms.uGlassGlow.value.setRGB(lit.r * 0.7 * nightMix, lit.g * 0.7 * nightMix, lit.b * 0.7 * nightMix, state.THREE.SRGBColorSpace);
    }
    state.scene.background.setRGB(light.skyR, light.skyG, light.skyB, state.THREE.SRGBColorSpace);
    const bob = waterBob(snapshot.timeOfDay);
    state.chunks.forEach((record) => {
      if (record.waterMesh) record.waterMesh.position.y = bob;
    });
    if (state.waterTexture) {
      // Water shimmers as a pure function of the snapshot clock: the tile
      // texture scrolls slowly and bobs with the surface.
      const time = Number.isFinite(snapshot.timeOfDay) ? snapshot.timeOfDay : 0;
      state.waterTexture.offset.x = time;
      state.waterTexture.offset.y = Math.sin(time * Math.PI * 2) * 0.06;
    }
  }

  function syncCamera(snapshot) {
    const rig = cameraRig(state.view, mapSize(snapshot), state.cssWidth, state.cssHeight);
    state.camera.left = -rig.halfW;
    state.camera.right = rig.halfW;
    state.camera.top = rig.halfH;
    state.camera.bottom = -rig.halfH;
    state.camera.near = rig.near;
    state.camera.far = rig.far;
    state.camera.position.set(rig.eyeX, rig.eyeY, rig.eyeZ);
    state.camera.up.set(0, 1, 0);
    state.camera.lookAt(rig.targetX, rig.targetY, rig.targetZ);
    state.camera.updateProjectionMatrix();
  }

  // --- public surface ---------------------------------------------------------

  async function mount(target) {
    const stack = resolveStack(target);
    if (state.mounted && stack === state.stack && !state.disposed) {
      await loadThree();
      return;
    }
    if (state.mounted) dispose();
    state.disposed = false;
    state.mounted = true;
    state.contextLost = false;
    state.stack = stack;

    let canvas = typeof stack.querySelector === "function"
      ? stack.querySelector('canvas[data-bonsai-layer="voxel"]')
      : null;
    if (!canvas) {
      canvas = document.createElement("canvas");
      stack.appendChild(canvas);
      state.createdCanvas = true;
    }
    canvas.dataset.bonsaiLayer = "voxel";
    // The shared layer class carries the app CSS that pins the canvas to the
    // stack (absolute inset, 100% size); the backing store never feeds layout.
    canvas.classList.add("bonsai-map-layer");
    canvas.setAttribute("aria-hidden", "true");
    state.canvas = canvas;

    // Probe on a throwaway canvas first: a failed probe must not poison the
    // real canvas, and the shell needs a typed error to fall back to Canvas.
    const probe = document.createElement("canvas");
    const probeContext = probe.getContext("webgl2") || probe.getContext("webgl");
    if (!probeContext) {
      dispose();
      throw webglUnavailableError("no webgl context");
    }

    let THREE;
    try {
      THREE = await loadThree();
    } catch (error) {
      dispose();
      throw error;
    }
    const recipeSource = await loadRecipeSource();
    const textureAssets = await loadTextureAssets();

    if (state.disposed) return;
    state.THREE = THREE;
    if (recipeSource) {
      state.recipes = buildRecipes(recipeSource);
      state.recipeRev += 1;
    }
    if (textureAssets) {
      state.textures = textureAssets.manifest;
      const texture = new THREE.CanvasTexture(textureAssets.image);
      // Atlas rectangles use top-origin image coordinates in both backends.
      // The default upload flip would sample a different row of the atlas.
      texture.flipY = false;
      // Full-atlas mip levels mix unrelated materials. Keep pixel sampling
      // within half-texel-inset rects; the separate water tile can mipmap.
      texture.generateMipmaps = false;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      state.texture = texture;
      state.ledger.track(texture);
      state.texturedMaterial = state.ledger.track(new THREE.MeshLambertMaterial({ map: texture, color: 0xffffff }));
      let maskTexture = null;
      if (textureAssets.maskImage) {
        maskTexture = state.ledger.track(new THREE.CanvasTexture(textureAssets.maskImage));
        maskTexture.flipY = false;
        maskTexture.generateMipmaps = false;
        maskTexture.minFilter = THREE.NearestFilter;
        maskTexture.magFilter = THREE.NearestFilter;
        maskTexture.colorSpace = THREE.NoColorSpace;
        maskTexture.needsUpdate = true;
      }
      state.wallMaterial = state.ledger.track(createWallMaterial(THREE, texture, maskTexture));
      const waterRect = state.textures.tiles.water;
      if (waterRect && typeof document !== "undefined") {
        const tileCanvas = document.createElement("canvas");
        tileCanvas.width = state.textures.tileSize;
        tileCanvas.height = state.textures.tileSize;
        const tileCtx = tileCanvas.getContext("2d");
        tileCtx.imageSmoothingEnabled = false;
        tileCtx.drawImage(textureAssets.image, waterRect.x, waterRect.y, waterRect.w, waterRect.h, 0, 0, state.textures.tileSize, state.textures.tileSize);
        const waterTexture = new THREE.CanvasTexture(tileCanvas);
        waterTexture.generateMipmaps = true;
        waterTexture.minFilter = THREE.NearestMipmapLinearFilter;
        waterTexture.magFilter = THREE.NearestFilter;
        waterTexture.wrapS = THREE.RepeatWrapping;
        waterTexture.wrapT = THREE.RepeatWrapping;
        waterTexture.colorSpace = THREE.SRGBColorSpace;
        waterTexture.needsUpdate = true;
        state.waterTexture = waterTexture;
        state.ledger.track(waterTexture);
      }
    }

    try {
      state.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    } catch (error) {
      dispose();
      throw webglUnavailableError(String(error && error.message || error));
    }
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // One sun, one shadow map. Hard-edged PCF keeps the blocks crisp; the
    // map is fitted to the visible ground every frame in syncLighting.
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFShadowMap;

    state.contextLostHandler = (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      state.contextLost = true;
    };
    canvas.addEventListener("webglcontextlost", state.contextLostHandler, false);

    const rect0 = containerRect();
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x1b2a20);
    state.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    state.ambient = new THREE.AmbientLight(0xffffff, 0.62);
    state.sun = new THREE.DirectionalLight(0xffffff, 0.85);
    state.sun.castShadow = true;
    state.sun.shadow.mapSize.set(shadowMapSizeFor(rect0.width, state.dpr), shadowMapSizeFor(rect0.width, state.dpr));
    state.frameSamples.length = 0;
    state.shadowReduced = false;
    state.sun.shadow.bias = -0.0006;
    state.sun.shadow.normalBias = 0.03;
    state.sun.shadow.camera.near = 1;
    state.sun.shadow.camera.far = SUN_DISTANCE * 2;
    // A fill light opposite the sun, no shadow: the faces the sun does not
    // reach keep their colour instead of dropping to ambient black.
    state.fill = new THREE.DirectionalLight(0xffffff, 0.3);
    state.staticGroup = new THREE.Group();
    state.dynamicGroup = new THREE.Group();
    state.scene.add(state.ambient, state.sun, state.sun.target, state.fill, state.staticGroup, state.dynamicGroup);
    state.sharedGeometry = state.ledger.track(new THREE.BoxGeometry(1, 1, 1));
    state.materials = createMaterials(THREE);
    if (state.waterTexture) {
      state.materials.waterTextured = state.ledger.track(new THREE.MeshLambertMaterial({
        map: state.waterTexture, color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false,
      }));
    }

    const rect = containerRect();
    resize(rect.width, rect.height);
    observeContainer();
    state.ready = true;
  }

  function isReady() {
    return state.ready && !state.disposed;
  }

  function resize(width, height, dpr) {
    const measured = containerRect();
    const cssWidth = Math.max(1, Math.round(Number.isFinite(width) ? width : measured.width));
    const cssHeight = Math.max(1, Math.round(Number.isFinite(height) ? height : measured.height));
    const nextDpr = requestedDpr(dpr);
    if (cssWidth === state.cssWidth && cssHeight === state.cssHeight && nextDpr === state.dpr) return;
    state.cssWidth = cssWidth;
    state.cssHeight = cssHeight;
    state.dpr = nextDpr;
    if (state.renderer) {
      state.renderer.setPixelRatio(nextDpr);
      state.renderer.setSize(cssWidth, cssHeight, false);
    }
    scheduleRender();
  }

  function applyViewState(viewState) {
    if (!viewState || typeof viewState !== "object") return;
    if (Number.isFinite(viewState.zoom)) state.view.zoom = clampZoom(viewState.zoom);
    if (Number.isFinite(viewState.rotation)) state.view.rotation = normalizeRotation(viewState.rotation);
    if (Number.isFinite(viewState.panX)) state.view.panX = viewState.panX;
    if (Number.isFinite(viewState.panY)) state.view.panY = viewState.panY;
    if (viewState.overlay !== undefined) state.overlay = normalizeOverlay(viewState.overlay);
  }

  function render(snapshot, viewState) {
    if (!state.ready || state.disposed || !snapshot) return;
    state.snapshot = snapshot;
    applyViewState(viewState);
    const frameStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : 0;
    // The static sweep hashes every chunk, so gate it on the snapshot's
    // structural revision. A foreign snapshot without rev sweeps every frame,
    // which stays correct, only slower.
    const staticKey = snapshot.rev === undefined
      ? null
      : `${snapshot.rev}:${mapSize(snapshot)}:${state.recipeRev}`;
    if (staticKey === null || state.lastKeys.static !== staticKey) {
      state.lastKeys.static = staticKey;
      const sceneObjects = collectSceneObjects(snapshot, state.recipes);
      syncStaticChunks(snapshot, sceneObjects);
    }
    syncDynamic(snapshot);
    syncLighting(snapshot);
    syncCamera(snapshot);
    state.renderer.render(state.scene, state.camera);
    if (frameStart) {
      const elapsed = performance.now() - frameStart;
      state.frameSamples.push(elapsed);
      if (state.frameSamples.length >= 30 && !state.shadowReduced) {
        const sorted = [...state.frameSamples].sort((a, b) => a - b);
        if (sorted[14] > 24) {
          // A slow small surface keeps its silhouette but halves shadow
          // texels; the budget probe fires once per mount.
          state.shadowReduced = true;
          const half = Math.max(256, Math.floor(shadowMapSizeFor(state.cssWidth, state.dpr) / 2));
          state.sun.shadow.map?.dispose?.();
          state.sun.shadow.map = null;
          state.sun.shadow.mapSize.set(half, half);
        }
      }
      if (state.frameSamples.length > 60) state.frameSamples.splice(0, 30);
    }
  }

  function pickTile(clientX, clientY, rect) {
    if (!state.snapshot || state.disposed || !state.ready) return null;
    const bounds = rect || (state.canvas && typeof state.canvas.getBoundingClientRect === "function"
      ? state.canvas.getBoundingClientRect()
      : { left: 0, top: 0, width: state.cssWidth, height: state.cssHeight });
    const left = Number(bounds.left) || 0;
    const top = Number(bounds.top) || 0;
    const rectWidth = Math.max(1, Number(bounds.width) || state.cssWidth);
    const rectHeight = Math.max(1, Number(bounds.height) || state.cssHeight);
    const px = (clientX - left) * (state.cssWidth / rectWidth);
    const py = (clientY - top) * (state.cssHeight / rectHeight);
    const size = mapSize(state.snapshot);

    const THREE = state.THREE;
    if (THREE && state.camera && state.staticGroup) {
      const ndc = new THREE.Vector2((px / state.cssWidth) * 2 - 1, -(py / state.cssHeight) * 2 + 1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, state.camera);
      const hits = raycaster.intersectObjects(state.staticGroup.children, false);
      if (hits.length) {
        // Step slightly into the block so a side-face hit floors to the
        // block's own tile, not the neighbor's.
        const point = hits[0].point.clone().addScaledVector(raycaster.ray.direction, 0.002);
        const x = Math.floor(point.x);
        const y = Math.floor(point.z);
        if (x >= 0 && y >= 0 && x < size && y < size) return { x, y };
      }
    }

    // Analytic fallback with the Canvas backend's two-pass altitude
    // refinement, for empty ground and WebGL-less unit surfaces.
    let tile = tileFromScreen(state.view, size, state.cssWidth, state.cssHeight, px, py, 0);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (tile.x < 0 || tile.y < 0 || tile.x >= size || tile.y >= size) break;
      tile = tileFromScreen(state.view, size, state.cssWidth, state.cssHeight, px, py, altitudeAt(state.snapshot, tile.y * size + tile.x));
    }
    if (tile.x < 0 || tile.y < 0 || tile.x >= size || tile.y >= size) return null;
    return { x: tile.x, y: tile.y };
  }

  function setPreview(preview) {
    state.preview = preview && typeof preview === "object" ? preview : null;
    state.previewRevision += 1;
    scheduleRender();
  }

  function clearPreview() {
    if (!state.preview) return;
    state.preview = null;
    state.previewRevision += 1;
    scheduleRender();
  }

  function rotateBy(quarterTurns) {
    if (!Number.isFinite(quarterTurns) || quarterTurns === 0) return state.view.rotation;
    const steps = Number.isInteger(quarterTurns) ? quarterTurns : Math.sign(quarterTurns);
    state.view.rotation = normalizeRotation(state.view.rotation + steps);
    if (state.snapshot) render(state.snapshot);
    return state.view.rotation;
  }

  function zoomBy(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return state.view.zoom;
    state.view.zoom = clampZoom(state.view.zoom * factor);
    if (state.snapshot) render(state.snapshot);
    return state.view.zoom;
  }

  function panByScreen(dx, dy) {
    if (Number.isFinite(dx)) state.view.panX += dx;
    if (Number.isFinite(dy)) state.view.panY += dy;
    if (state.snapshot) render(state.snapshot);
    return { x: state.view.panX, y: state.view.panY };
  }

  function resetView(options = {}) {
    state.view.zoom = clampZoom(Number.isFinite(options.zoom) ? options.zoom : DEFAULT_ZOOM);
    state.view.rotation = normalizeRotation(options.rotation);
    state.view.panX = Number.isFinite(options.panX) ? options.panX : 0;
    state.view.panY = Number.isFinite(options.panY) ? options.panY : 0;
    const center = options.center;
    const centerSize = Number.isInteger(options.size) && options.size > 0
      ? options.size
      : (state.snapshot ? mapSize(state.snapshot) : 0);
    if (center && Number.isFinite(center.x) && Number.isFinite(center.y) && centerSize > 0) {
      const pan = panToCenter(center, centerSize, state.view, state.cssWidth || 1, state.cssHeight || 1);
      state.view.panX = pan.panX;
      state.view.panY = pan.panY;
    }
    state.overlay = normalizeOverlay(options.overlay);
    if (state.snapshot) render(state.snapshot);
  }

  function miniMapFallback(canvas, snapshot, options = {}) {
    if (!canvas || typeof canvas.getContext !== "function" || !snapshot) return null;
    const cssWidth = Math.max(1, Math.round(Number(options.width) || Number(canvas.clientWidth) || 160));
    const cssHeight = Math.max(1, Math.round(Number(options.height) || Number(canvas.clientHeight) || 112));
    const dpr = requestedDpr(options.dpr);
    const backingWidth = Math.max(1, Math.round(cssWidth * dpr));
    const backingHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const size = mapSize(snapshot);
    const overlay = normalizeOverlay(options.overlay);
    for (let y = 0; y < size; y += 1) {
      const top = Math.floor((y * cssHeight) / size);
      const bottom = Math.ceil(((y + 1) * cssHeight) / size);
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        const left = Math.floor((x * cssWidth) / size);
        const right = Math.ceil(((x + 1) * cssWidth) / size);
        const kind = terrainKindAt(snapshot, index);
        context.fillStyle = kind === "water" ? "#356e9a" : kind === "rock" ? "#858782" : kind === "soil" ? "#956d49" : "#639354";
        context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
        if (overlay !== "none" && kind !== "water") {
          const color = overlayColor(overlay, overlayBucket(overlay, overlayValue(snapshot, overlay, index)));
          context.fillStyle = `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${color.a})`;
          context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
        }
      }
    }
    return Object.freeze({ cssWidth, cssHeight, backingWidth, backingHeight, dpr, tileCount: size * size, overlay });
  }

  function renderMiniMap(canvas, snapshot, options = {}) {
    // The mini map is backend independent 2D work; when the Canvas backend is
    // loaded its implementation is the shared, fully featured one.
    const canvasBackend = window.AISystem6BonsaiCanvasRenderer;
    if (canvasBackend && typeof canvasBackend.renderMiniMap === "function") {
      return canvasBackend.renderMiniMap(canvas, snapshot, options);
    }
    return miniMapFallback(canvas, snapshot, options);
  }

  function dispose() {
    if (state.observer) state.observer.disconnect();
    state.observer = null;
    if (state.activeRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(state.activeRaf);
    state.activeRaf = 0;
    if (state.canvas && state.contextLostHandler) {
      state.canvas.removeEventListener("webglcontextlost", state.contextLostHandler, false);
    }
    state.contextLostHandler = null;
    state.chunks.forEach(disposeChunkRecord);
    state.chunks.clear();
    Object.keys(state.dynamicMeshes).forEach((key) => {
      disposeMesh(state.dynamicMeshes[key]);
      state.dynamicMeshes[key] = null;
    });
    state.ledger.drain((resource) => {
      if (resource && typeof resource.dispose === "function") resource.dispose();
    });
    if (state.renderer) {
      state.renderer.dispose();
      try {
        if (typeof state.renderer.forceContextLoss === "function") state.renderer.forceContextLoss();
      } catch {
        // A context that is already lost throws here; the goal is reached.
      }
    }
    if (state.createdCanvas && state.canvas && typeof state.canvas.remove === "function") state.canvas.remove();
    state.createdCanvas = false;
    state.canvas = null;
    state.renderer = null;
    state.scene = null;
    state.camera = null;
    state.ambient = null;
    state.sun = null;
    state.fill = null;
    state.staticGroup = null;
    state.dynamicGroup = null;
    state.sharedGeometry = null;
    state.materials = null;
    state.textures = null;
    state.texture = null;
    state.texturedMaterial = null;
    state.wallMaterial = null;
    state.waterTexture = null;
    state.tileGeometries.clear();
    state.stack = null;
    state.snapshot = null;
    state.preview = null;
    state.overlay = "none";
    state.lastKeys = {};
    state.instanceCount = 0;
    state.ready = false;
    state.mounted = false;
    state.disposed = true;
    state.cssWidth = 0;
    state.cssHeight = 0;
  }

  // The instance count of what is on screen now: every chunk mesh plus the
  // dynamic meshes. A running counter would only grow across rebuilds.
  // Instances per tile key across the static chunks: the probe that says
  // which materials actually reached the GPU.
  function tileGroupCounts() {
    const counts = {};
    state.chunks.forEach((record) => {
      (record.meshes || []).forEach((mesh) => {
        if (!mesh) return;
        const key = mesh.userData.tileKey || (mesh === record.waterMesh ? "water" : "flat");
        counts[key] = (counts[key] || 0) + mesh.count;
      });
    });
    return counts;
  }

  function tileGroupColors() {
    const colors = {};
    state.chunks.forEach((record) => {
      (record.meshes || []).forEach((mesh) => {
        if (!mesh || !mesh.userData.tileKey || colors[mesh.userData.tileKey] || !mesh.instanceColor) return;
        const array = mesh.instanceColor.array;
        const seen = new Set();
        for (let i = 0; i < mesh.count; i += 1) {
          seen.add([array[i * 3], array[i * 3 + 1], array[i * 3 + 2]].map((v) => Math.round(v * 255)).join(","));
        }
        colors[mesh.userData.tileKey] = [...seen].slice(0, 12);
      });
    });
    return colors;
  }

  function liveInstanceCount() {
    let count = 0;
    state.chunks.forEach((record) => {
      (record.meshes || []).forEach((mesh) => { count += mesh ? mesh.count : 0; });
    });
    Object.keys(state.dynamicMeshes).forEach((key) => {
      const mesh = state.dynamicMeshes[key];
      count += mesh ? mesh.count : 0;
    });
    return count;
  }

  function debugStats() {
    const view = Object.freeze({
      rotation: state.view.rotation,
      zoom: state.view.zoom,
      panX: state.view.panX,
      panY: state.view.panY,
      overlay: state.overlay,
    });
    return Object.freeze({
      backend: "three-voxel",
      cssWidth: state.cssWidth,
      cssHeight: state.cssHeight,
      backingWidth: Math.round(state.cssWidth * state.dpr),
      backingHeight: Math.round(state.cssHeight * state.dpr),
      dpr: state.dpr,
      activeRaf: Number(state.activeRaf || 0),
      chunkCacheCount: state.chunks.size,
      chunkBuildCount: state.chunkBuildCount,
      visibleTileCount: state.snapshot ? mapSize(state.snapshot) ** 2 : 0,
      layerCount: 1,
      instanceCount: liveInstanceCount(),
      tileGroups: tileGroupCounts(),
      tileColors: tileGroupColors(),
      glass: state.wallMaterial ? {
        color: state.wallMaterial.userData.uniforms.uGlassColor.value.getHexString(),
        glow: state.wallMaterial.userData.uniforms.uGlassGlow.value.getHexString(),
      } : null,
      timeOfDay: state.snapshot ? state.snapshot.timeOfDay : null,
      night: state.snapshot ? isNight(state.snapshot) : null,
      shadowMapSize: state.sun ? state.sun.shadow.mapSize.x : 0,
      frameProbe: {
        samples: state.frameSamples.length,
        reduced: state.shadowReduced,
      },
      outstandingResources: state.ledger.count(),
      contextLost: state.contextLost,
      rotation: state.view.rotation,
      zoom: state.view.zoom,
      panX: state.view.panX,
      panY: state.view.panY,
      overlay: state.overlay,
      view,
      disposed: state.disposed,
    });
  }

  window.AISystem6BonsaiVoxelRenderer = Object.freeze({
    BACKEND: "three-voxel",
    LAYERS,
    CHUNK_SIZE,
    WEBGL_UNAVAILABLE_CODE,
    mount,
    isReady,
    resize,
    render,
    pickTile,
    setPreview,
    clearPreview,
    renderMiniMap,
    rotateBy,
    zoomBy,
    panByScreen,
    resetView,
    dispose,
    debugStats,
    whenReady: loadThree,
    pure: PURE,
  });
})();
