// Bonsai City real-place import: the server half.
//
// The desk's content security policy forbids the browser from reaching
// another host, so this process asks three public services on its behalf:
//
//   Overpass API        OpenStreetMap features inside the map square (ODbL)
//   Terrain Tiles       AWS-hosted Mapzen terrarium PNGs, sampled to one
//                       height per map cell
//   Nominatim           a place name typed by the player, turned into a point
//
// Everything here is a relay with limits: the area is fixed by the map size
// (16 m a cell, 64/96/128 cells a side), answers are cached, upstream calls
// are serialised, and every request names this application. The mapping of
// OSM features to Bonsai tiles is not done here; the browser's headless
// importer owns it (apps/desktop/app/features/bonsai-osm-import.js), so it
// can be tested without the network.

"use strict";

const https = require("node:https");
const zlib = require("node:zlib");

const { getTextWithFallback } = require("./lib/fetch.js");
const { proxyUrlForTarget, httpProxyAgentFor } = require("./lib/proxy.js");

const CELL_METERS = 16;
const MAP_SIZES = Object.freeze([64, 96, 128]);
const METERS_PER_DEGREE = 111320;
const USER_AGENT = "AI-System-6-Bonsai-City/1.0 (+https://system6.aaronlau.me; OpenStreetMap import)";
const ATTRIBUTION = Object.freeze({
  osm: "© OpenStreetMap contributors",
  osmLicense: "ODbL-1.0",
  elevation: "Terrain Tiles (Mapzen, AWS Open Data); SRTM, GMTED2010 and 3DEP courtesy of the U.S. Geological Survey; ETOPO1: U.S. NOAA; and the regional sources listed by tilezen/joerd",
});

function envList(name, fallback) {
  const raw = String(process.env[name] || "").trim();
  const list = raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : fallback;
  return list.filter((item) => /^https:\/\//.test(item));
}

// The public instance first, then a second public instance when the first is
// busy. An operator with their own Overpass server names it here instead.
const OVERPASS_URLS = envList("BONSAI_OVERPASS_URLS", [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]);
const TERRAIN_URL = String(process.env.BONSAI_TERRAIN_URL || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium").replace(/\/$/, "");
const NOMINATIM_URL = String(process.env.BONSAI_NOMINATIM_URL || "https://nominatim.openstreetmap.org/search");
const TERRAIN_ZOOM = 14;
const OVERPASS_MAX_BYTES = 48 * 1024 * 1024;
const TILE_MAX_BYTES = 2 * 1024 * 1024;

// --- Area -------------------------------------------------------------------

function badRequest(message, code = "bad_request") {
  const error = /** @type {Error & { statusCode?: number, code?: string }} */ (new Error(message));
  error.statusCode = 400;
  error.code = code;
  return error;
}

/**
 * The map square for a centre point and a map size. The browser uses the same
 * numbers (the response carries them), so a cell lands on the same ground on
 * both sides. A local equirectangular frame is exact enough over 2 km.
 */
function areaFor(latInput, lonInput, sizeInput) {
  const lat = Number(latInput);
  const lon = Number(lonInput);
  const size = Number(sizeInput);
  if (!Number.isFinite(lat) || lat < -80 || lat > 80) throw badRequest("Latitude must be between -80 and 80.", "bad_latitude");
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw badRequest("Longitude must be between -180 and 180.", "bad_longitude");
  if (!MAP_SIZES.includes(size)) throw badRequest("Map size must be 64, 96 or 128.", "bad_size");
  // Rounded so near-identical requests share one cache entry and one answer.
  const cLat = Math.round(lat * 1e5) / 1e5;
  const cLon = Math.round(lon * 1e5) / 1e5;
  const half = (size * CELL_METERS) / 2;
  const dLat = half / METERS_PER_DEGREE;
  const dLon = half / (METERS_PER_DEGREE * Math.cos((cLat * Math.PI) / 180));
  const round = (value) => Math.round(value * 1e7) / 1e7;
  return {
    lat: cLat, lon: cLon, size, cellMeters: CELL_METERS,
    south: round(cLat - dLat), west: round(cLon - dLon), north: round(cLat + dLat), east: round(cLon + dLon),
  };
}

// --- Small caches and a serial gate -------------------------------------------

class LruCache {
  constructor(maxEntries) { this.maxEntries = maxEntries; this.map = new Map(); }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key); this.map.delete(key); this.map.set(key, value); return value;
  }
  set(key, value) {
    this.map.delete(key); this.map.set(key, value);
    while (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value);
  }
}

const featureCache = new LruCache(12);
const elevationCache = new LruCache(24);
const tileCache = new LruCache(48);
const placeCache = new LruCache(200);

function busyError(message) {
  const error = /** @type {Error & { statusCode?: number, code?: string }} */ (new Error(message));
  error.statusCode = 429; error.code = "busy"; return error;
}

// One upstream Overpass query at a time from this process: the public
// instances give each address two slots, and a second player waits on the
// first player's answer rather than doubling the load.
let overpassInFlight = null;
// Nominatim allows one request a second, from the whole application.
let lastNominatimAt = 0;

// A daily ceiling on uncached upstream imports, per process. The public
// Overpass instances ask not to be used as the backend of a public site, so
// the public deployment keeps its use to what a few players need; an
// operator lifts it by pointing BONSAI_OVERPASS_URLS at their own server.
const dailyUpstream = { day: "", count: 0 };
function dailyUpstreamLimit(isPublic) {
  const configured = Number(process.env.BONSAI_OSM_DAILY_LIMIT);
  if (Number.isInteger(configured) && configured >= 0) return configured;
  return isPublic ? 150 : 2000;
}
function chargeDailyUpstream(isPublic, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  if (dailyUpstream.day !== day) { dailyUpstream.day = day; dailyUpstream.count = 0; }
  if (dailyUpstream.count >= dailyUpstreamLimit(isPublic)) {
    const error = /** @type {Error & { statusCode?: number, code?: string }} */ (new Error("Today's share of the map service is used up. Try again tomorrow."));
    error.statusCode = 429; error.code = "daily_limit"; throw error;
  }
  dailyUpstream.count += 1;
}

// --- Overpass -------------------------------------------------------------------

const ROAD_CLASSES = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link";
// Public services the importer turns into Bonsai facilities on their real
// sites, plus the grounds it leaves open for them.
const CIVIC_AMENITIES = "police|fire_station|school|kindergarten|university|college|hospital|clinic|doctors|library|prison|place_of_worship|grave_yard";
const KEEP_TAGS = new Set([
  "highway", "railway", "waterway", "natural", "water", "landuse", "leisure", "amenity", "building", "building:levels", "height",
  "tunnel", "bridge", "layer", "covered", "area", "intermittent", "service", "location", "tourism",
]);

function overpassQuery(area, includeBuildings) {
  const box = `(${area.south},${area.west},${area.north},${area.east})`;
  return [
    "[out:json][timeout:90][maxsize:268435456];",
    "(",
    `way["highway"~"^(${ROAD_CLASSES})$"]${box};`,
    `way["railway"~"^(rail|light_rail|narrow_gauge|subway|monorail|tram)$"]${box};`,
    `way["waterway"~"^(river|canal|stream|riverbank|dock)$"]${box};`,
    `way["natural"~"^(water|coastline|wood|bay|wetland|beach|scrub)$"]${box};`,
    `relation["natural"~"^(water|wood|bay|wetland)$"]${box};`,
    `way["landuse"]${box};`,
    `relation["landuse"]${box};`,
    `way["leisure"~"^(park|garden|golf_course|nature_reserve|pitch|playground|recreation_ground)$"]${box};`,
    `relation["leisure"~"^(park|garden|nature_reserve)$"]${box};`,
    `way["amenity"~"^(${CIVIC_AMENITIES})$"]${box};`,
    `node["amenity"~"^(${CIVIC_AMENITIES})$"]${box};`,
    `nwr["tourism"="museum"]${box};`,
    `way["leisure"="stadium"]${box};`,
    includeBuildings ? `way["building"]${box};` : "",
    ");",
    "out tags geom;",
  ].join("");
}

const roundCoord = (value) => Math.round(value * 1e7) / 1e7;

function compactTags(tags) {
  const out = {};
  for (const [key, value] of Object.entries(tags || {})) if (KEEP_TAGS.has(key)) out[key] = String(value).slice(0, 64);
  return out;
}

function compactGeometry(geometry) {
  const flat = [];
  for (const point of Array.isArray(geometry) ? geometry : []) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    flat.push(roundCoord(point.lat), roundCoord(point.lon));
  }
  return flat;
}

/**
 * Overpass JSON to the compact shape the importer reads: ways carry a flat
 * [lat, lon, lat, lon, ...] line, relations carry their members' lines and
 * roles, and only the tags the importer maps travel.
 */
function compactOverpass(json) {
  const elements = [];
  for (const element of Array.isArray(json?.elements) ? json.elements : []) {
    if (element.type === "node") {
      if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) elements.push({ type: "node", id: element.id, tags: compactTags(element.tags), g: [roundCoord(element.lat), roundCoord(element.lon)] });
    } else if (element.type === "way") {
      const g = compactGeometry(element.geometry);
      if (g.length >= 4) elements.push({ type: "way", id: element.id, tags: compactTags(element.tags), g });
    } else if (element.type === "relation") {
      const members = [];
      for (const member of Array.isArray(element.members) ? element.members : []) {
        if (member.type !== "way") continue;
        const g = compactGeometry(member.geometry);
        if (g.length >= 4) members.push({ role: member.role === "inner" ? "inner" : "outer", g });
      }
      if (members.length) elements.push({ type: "relation", id: element.id, tags: compactTags(element.tags), members });
    }
  }
  // Stable order: the importer's answer must not depend on the server's.
  const order = { node: 0, way: 1, relation: 2 };
  elements.sort((a, b) => (a.type === b.type ? a.id - b.id : order[a.type] - order[b.type]));
  return elements;
}

async function fetchOverpass(area, includeBuildings, signal) {
  const query = overpassQuery(area, includeBuildings);
  let lastError = null;
  for (const endpoint of OVERPASS_URLS) {
    try {
      const response = await getTextWithFallback(`${endpoint}?data=${encodeURIComponent(query)}`, signal, {
        "Accept": "application/json", "User-Agent": USER_AGENT,
      }, { maxBytes: OVERPASS_MAX_BYTES });
      if (!response.ok) { lastError = new Error(`Overpass answered ${response.status}.`); continue; }
      const json = JSON.parse(response.text);
      if (json?.remark && /runtime error/i.test(String(json.remark))) { lastError = new Error("Overpass could not finish the query."); continue; }
      return { endpoint, timestamp: String(json?.osm3s?.timestamp_osm_base || ""), elements: compactOverpass(json) };
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  const error = /** @type {Error & { statusCode?: number, code?: string }} */ (new Error(`The map service is not answering (${lastError?.message || "no endpoint"}).`));
  error.statusCode = 502; error.code = "upstream_unavailable";
  throw error;
}

/**
 * @param {{ lat: unknown, lon: unknown, size: unknown, buildings?: unknown }} request
 * @param {{ signal?: AbortSignal, isPublic?: boolean }} [options]
 */
async function osmFeatures({ lat, lon, size, buildings }, { signal, isPublic = false } = {}) {
  const area = areaFor(lat, lon, size);
  const includeBuildings = buildings === true || buildings === "1" || buildings === "true";
  const key = `${area.lat},${area.lon},${area.size},${includeBuildings ? 1 : 0}`;
  const cached = featureCache.get(key);
  if (cached) return { ...cached, cached: true };
  if (overpassInFlight) throw busyError("Another map is being fetched. Try again in a moment.");
  chargeDailyUpstream(isPublic);
  overpassInFlight = fetchOverpass(area, includeBuildings, signal);
  try {
    const result = await overpassInFlight;
    const answer = {
      area, buildings: includeBuildings, timestamp: result.timestamp, elements: result.elements,
      attribution: ATTRIBUTION.osm, license: ATTRIBUTION.osmLicense,
    };
    featureCache.set(key, answer);
    return { ...answer, cached: false };
  } finally {
    overpassInFlight = null;
  }
}

// --- Terrain tiles ----------------------------------------------------------------

function getBuffer(url, signal, maxBytes = TILE_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const proxy = proxyUrlForTarget(url);
    const request = https.get(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "image/png" },
      agent: proxy ? httpProxyAgentFor(proxy) : undefined,
      timeout: 20000,
    }, (response) => {
      if ((response.statusCode || 0) >= 300) {
        response.resume();
        reject(Object.assign(new Error(`Terrain tile answered ${response.statusCode}.`), { statusCode: 502, code: "upstream_unavailable" }));
        return;
      }
      const chunks = []; let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) { request.destroy(new Error("Terrain tile too large.")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Terrain tile timed out.")));
    request.on("error", reject);
    if (signal) {
      if (signal.aborted) request.destroy(new Error("aborted"));
      else signal.addEventListener("abort", () => request.destroy(new Error("aborted")), { once: true });
    }
  });
}

/**
 * A minimal PNG reader for the terrarium tiles: 8-bit truecolour with or
 * without alpha, not interlaced. Returns RGB(A) bytes and the channel count.
 */
function decodePng(buffer) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || signature.some((byte, i) => buffer[i] !== byte)) throw new Error("Not a PNG.");
  let offset = 8; let width = 0; let height = 0; let channels = 0; const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset); const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      const depth = data[8]; const colour = data[9]; const interlace = data[12];
      if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0) throw new Error("Unsupported PNG layout.");
      channels = colour === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!width || !height || !channels) throw new Error("PNG has no header.");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels; const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[y * stride + x - channels] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? out[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) throw new Error("Bad PNG filter.");
      out[y * stride + x] = value & 255;
    }
  }
  return { width, height, channels, data: out };
}

/** Terrarium encoding: metres = R * 256 + G + B / 256 - 32768. */
function terrariumHeights(png) {
  const heights = new Float32Array(png.width * png.height);
  for (let i = 0; i < heights.length; i += 1) {
    const o = i * png.channels;
    heights[i] = png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768;
  }
  return heights;
}

function tileXY(lat, lon, zoom) {
  const n = 2 ** zoom; const rad = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n };
}

async function terrainTile(x, y, signal) {
  const key = `${TERRAIN_ZOOM}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) return cached;
  const png = decodePng(await getBuffer(`${TERRAIN_URL}/${key}.png`, signal));
  const tile = { width: png.width, height: png.height, heights: terrariumHeights(png) };
  tileCache.set(key, tile);
  return tile;
}

/**
 * One height in metres per map cell, bilinear between terrarium pixels at the
 * cell centre. Row-major, north row first, west column first — the order the
 * importer lays its grid in.
 */
/**
 * @param {{ lat: unknown, lon: unknown, size: unknown }} request
 * @param {{ signal?: AbortSignal }} [options]
 */
async function elevationGrid({ lat, lon, size }, { signal } = {}) {
  const area = areaFor(lat, lon, size);
  const key = `${area.lat},${area.lon},${area.size}`;
  const cached = elevationCache.get(key);
  if (cached) return { ...cached, cached: true };
  const n = area.size; const heights = new Array(n * n);
  const dLat = (area.north - area.south) / n; const dLon = (area.east - area.west) / n;
  const tiles = new Map();
  const tileFor = async (tx, ty) => {
    const k = `${tx},${ty}`;
    if (!tiles.has(k)) tiles.set(k, await terrainTile(tx, ty, signal));
    return tiles.get(k);
  };
  const pixel = async (px, py) => {
    const tx = Math.floor(px / 256); const ty = Math.floor(py / 256);
    const tile = await tileFor(tx, ty);
    const ix = Math.min(tile.width - 1, Math.max(0, Math.floor(px - tx * 256)));
    const iy = Math.min(tile.height - 1, Math.max(0, Math.floor(py - ty * 256)));
    return tile.heights[iy * tile.width + ix];
  };
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const p = tileXY(area.north - (y + 0.5) * dLat, area.west + (x + 0.5) * dLon, TERRAIN_ZOOM);
      const fx = p.x * 256 - 0.5; const fy = p.y * 256 - 0.5;
      const x0 = Math.floor(fx); const y0 = Math.floor(fy); const tx = fx - x0; const ty = fy - y0;
      const a = await pixel(x0, y0); const b = await pixel(x0 + 1, y0);
      const c = await pixel(x0, y0 + 1); const d = await pixel(x0 + 1, y0 + 1);
      const value = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
      heights[y * n + x] = Math.round(value * 10) / 10;
    }
  }
  const answer = { area, zoom: TERRAIN_ZOOM, heights, attribution: ATTRIBUTION.elevation };
  elevationCache.set(key, answer);
  return { ...answer, cached: false };
}

// --- Place search -----------------------------------------------------------------

/**
 * @param {unknown} queryInput
 * @param {{ signal?: AbortSignal, language?: string }} [options]
 */
async function searchPlace(queryInput, { signal, language = "" } = {}) {
  const query = String(queryInput || "").trim().slice(0, 120);
  if (query.length < 2) throw badRequest("Type at least two characters.", "bad_query");
  const lang = /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(language) ? language : "";
  const key = `${lang}|${query.toLowerCase()}`;
  const cached = placeCache.get(key);
  if (cached) return { ...cached, cached: true };
  const wait = 1100 - (Date.now() - lastNominatimAt);
  if (wait > 0) throw busyError("One place search a second. Try again in a moment.");
  lastNominatimAt = Date.now();
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "6", addressdetails: "0" });
  const headers = { "Accept": "application/json", "User-Agent": USER_AGENT };
  if (lang) headers["Accept-Language"] = lang;
  const response = await getTextWithFallback(`${NOMINATIM_URL}?${params}`, signal, headers, { maxBytes: 256 * 1024 });
  if (!response.ok) {
    const error = /** @type {Error & { statusCode?: number, code?: string }} */ (new Error(`Place search answered ${response.status}.`));
    error.statusCode = 502; error.code = "upstream_unavailable"; throw error;
  }
  const rows = JSON.parse(response.text);
  const places = (Array.isArray(rows) ? rows : []).map((row) => ({
    name: String(row.display_name || row.name || "").slice(0, 200),
    lat: Math.round(Number(row.lat) * 1e5) / 1e5,
    lon: Math.round(Number(row.lon) * 1e5) / 1e5,
    kind: String(row.type || row.category || "").slice(0, 32),
  })).filter((row) => row.name && Number.isFinite(row.lat) && Number.isFinite(row.lon));
  const answer = { query, places, attribution: ATTRIBUTION.osm };
  placeCache.set(key, answer);
  return { ...answer, cached: false };
}

module.exports = {
  CELL_METERS, MAP_SIZES, ATTRIBUTION, USER_AGENT, TERRAIN_ZOOM,
  areaFor, overpassQuery, compactOverpass, decodePng, terrariumHeights, tileXY,
  osmFeatures, elevationGrid, searchPlace, chargeDailyUpstream, dailyUpstreamLimit,
  resetForTests: () => {
    featureCache.map.clear(); elevationCache.map.clear(); tileCache.map.clear(); placeCache.map.clear();
    dailyUpstream.day = ""; dailyUpstream.count = 0; overpassInFlight = null; lastNominatimAt = 0;
  },
};
