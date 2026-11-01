// Bonsai City real-place import contracts: the headless OSM importer's
// mapping rules and determinism, and the server relay's fixed limits.
// Every fixture is synthetic — OSM features and heights are built by this
// test at run time in grid coordinates; nothing reaches the network.
import vm from "node:vm";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-osm-import");
const require = createRequire(import.meta.url);
process.env.BONSAI_OSM_DAILY_LIMIT = "2";
const service = require(`${root}/apps/server/server/bonsai-osm.js`);

const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder, setTimeout, clearTimeout });
vm.runInContext(read("app/features/bonsai-city-sim.js"), context);
vm.runInContext(read("app/features/bonsai-osm-import.js"), context);
const sim = context.window.AISystem6BonsaiSim;
const importer = context.window.AISystem6BonsaiOsmImport;

// --- Static discipline -----------------------------------------------------
const source = read("app/features/bonsai-osm-import.js");
test.assertIncludes(source, "AISystem6BonsaiOsmImportLoaded", "the importer sets its loaded flag");
test.assertNotMatches(source, /Math\.random|Date\.now|performance\.now|new Date|fetch\(|https?:\/\//, "the importer is headless, deterministic and offline");
test.assertIncludes(source, "© OpenStreetMap contributors", "the importer carries the ODbL attribution");
test.assertIncludes(read("app/core/config.js"), '"app/features/bonsai-osm-import.js"', "the Bonsai lazy loader names the importer");
test.assertIncludes(read("tooling/runtime-manifest.mjs"), '"app/features/bonsai-osm-import.js"', "the runtime manifest lists the importer as lazy");

// --- Server relay ------------------------------------------------------------
const area = service.areaFor(25, 121, 64);
test.assert(area.size === 64 && area.cellMeters === 16, "the square is fixed by the map size at 16 m a tile");
const spanMeters = (area.north - area.south) * 111320;
test.assert(Math.abs(spanMeters - 64 * 16) < 1, `the square is 1024 m tall (got ${spanMeters.toFixed(1)})`);
for (const bad of [[25, 121, 100], [95, 121, 64], [25, 200, 64], ["x", 121, 64]]) {
  let refused = false;
  try { service.areaFor(...bad); } catch (error) { refused = error.statusCode === 400; }
  test.assert(refused, `an out-of-range request is refused: ${bad.join(",")}`);
}
test.assertIncludes(service.overpassQuery(area, true), 'way["building"]', "buildings are asked for when the player wants them");
test.assertNotIncludes(service.overpassQuery(area, false), 'way["building"]', "buildings are not fetched for a bare map");
const compact = service.compactOverpass({ elements: [
  { type: "way", id: 9, tags: { highway: "primary", name: "Private Name", "addr:street": "x" }, geometry: [{ lat: 1, lon: 2 }, { lat: 1.5, lon: 2.5 }] },
  { type: "node", id: 3, tags: { amenity: "police", phone: "123" }, lat: 1.1, lon: 2.1 },
  { type: "relation", id: 4, tags: { natural: "water" }, members: [{ type: "way", role: "inner", geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }] }] },
] });
test.assert(compact.map((item) => item.type).join() === "node,way,relation", "the relay orders nodes, ways, relations");
test.assert(compact[1].tags.name === "Private Name" && !("addr:street" in compact[1].tags) && !("phone" in compact[0].tags), "real names travel while the tags the importer does not map are dropped");
const query = service.overpassQuery(area, true);
test.assertIncludes(query, 'node["railway"~"^(station|halt)$"]', "the query asks for railway stations and halts as nodes");
test.assertIncludes(query, 'node["public_transport"="station"]', "the query asks for public-transport station nodes");
test.assertIncludes(query, 'node["place"~"^(suburb|quarter|neighbourhood|village|hamlet)$"]', "the query asks for the district place nodes");
test.assert(compact[2].members[0].role === "inner" && compact[2].members[0].g.length === 4, "relation members keep their role and line");

// A synthetic terrarium PNG: 2x2, rows filtered None and Paeth.
function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}
const encodeMetres = (m) => { const v = m + 32768; return [Math.floor(v / 256), Math.floor(v) % 256, Math.round((v % 1) * 256)]; };
const pixels = [encodeMetres(0), encodeMetres(12.5), encodeMetres(-3), encodeMetres(100)];
const header = Buffer.alloc(13); header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 2;
const rowOne = [0, ...pixels[0], ...pixels[1]];
const rowTwoRaw = [...pixels[2], ...pixels[3]];
const rowTwo = [4, ...rowTwoRaw.map((value, x) => {
  const left = x >= 3 ? rowTwoRaw[x - 3] : 0; const up = rowOne[1 + x]; const upLeft = x >= 3 ? rowOne[1 + x - 3] : 0;
  const p = left + up - upLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft);
  return (value - (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft) + 256) & 255;
})];
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
  chunk("IDAT", zlib.deflateSync(Buffer.from([...rowOne, ...rowTwo]))), chunk("IEND", Buffer.alloc(0))]);
const heights = service.terrariumHeights(service.decodePng(png));
test.assert([0, 12.5, -3, 100].every((value, i) => Math.abs(heights[i] - value) < 0.01), `terrarium pixels decode to metres (${Array.from(heights).join(", ")})`);

service.resetForTests();
service.chargeDailyUpstream(true); service.chargeDailyUpstream(true);
let capped = false;
try { service.chargeDailyUpstream(true); } catch (error) { capped = error.statusCode === 429 && error.code === "daily_limit"; }
test.assert(capped, "uncached upstream queries stop at the daily ceiling");
service.resetForTests();

const router = read("apps/server/server/router.js");
for (const key of ["GET /api/bonsai/osm", "GET /api/bonsai/elevation", "GET /api/bonsai/place"]) {
  test.assert(router.split(`"${key}"`).length === 3, `${key} is routed locally and listed for the public deployment`);
}
const guard = read("apps/server/server/security/public-session.js");
test.assertIncludes(guard, '"/api/bonsai/",', "the public deployment bounds the relay with the reader pool");
test.assertNotMatches(guard.slice(guard.indexOf("const sessionFreePaths"), guard.indexOf("class TtlLruWindows")), /api\/bonsai/, "the relay is not session-free on the public deployment");
test.assertIncludes(read("apps/server/server/bonsai-osm.js"), "User-Agent", "every upstream request names the application");
test.assertIncludes(read("app/core/service-providers.js"), 'registerServiceProvider?.("bonsai.osm"', "the service layer owns the relay's routes");
test.assertIncludes(read("app/features/bonsai-city.js"), 'requestService("bonsai.osm"', "Map Setup reaches the relay through the service layer");
test.assertNotMatches(read("app/features/bonsai-city.js"), /fetch\(`\/api\/bonsai/, "Map Setup never fetches the relay directly");

// --- Synthetic place ---------------------------------------------------------
const n = 64;
const ll = (x, y) => [area.north - (y / n) * (area.north - area.south), area.west + (x / n) * (area.east - area.west)];
const line = (...points) => points.flatMap(([x, y]) => ll(x, y));
const box = (x0, y0, x1, y1) => line([x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]);
let nextId = 1;
const way = (tags, g) => ({ type: "way", id: nextId++, tags, g });
const node = (tags, x, y) => ({ type: "node", id: nextId++, tags, g: ll(x, y) });
const elements = [
  way({ highway: "primary", bridge: "yes" }, line([-2, 20.5], [66, 20.5])),
  way({ highway: "tertiary", oneway: "yes" }, line([5, 44.3], [60, 44.3])),
  way({ highway: "tertiary", oneway: "yes" }, line([60, 45.4], [5, 45.4])),
  way({ highway: "residential" }, line([5.5, 5.5], [18.5, 17.5])),
  way({ highway: "motorway" }, line([50.5, -1], [50.5, 57])),
  way({ highway: "residential" }, line([46.5, 20.5], [46.5, 30.5])),
  way({ highway: "motorway_link" }, line([46.5, 24.5], [50.5, 24.5])),
  way({ highway: "primary", tunnel: "yes" }, line([2.5, 2.5], [2.5, 60])),
  way({ natural: "water", water: "river" }, box(25, -1, 30, 50)),
  way({ natural: "coastline" }, line([-1, 58.5], [65, 58.5])),
  way({ landuse: "residential" }, box(4, 22, 22, 36)),
  way({ highway: "residential" }, line([15.5, 22], [15.5, 36])),
  way({ landuse: "commercial" }, box(32, 25, 44, 36)),
  way({ leisure: "park" }, box(18, 30, 21, 33)),
  way({ landuse: "forest" }, box(55, 5, 62, 15)),
  way({ building: "apartments", "building:levels": "12" }, box(10, 21, 13, 24)),
  way({ building: "house" }, box(14.2, 21.2, 14.8, 21.8)),
  way({ building: "residential" }, box(12.2, 30.2, 13.8, 31.8)),
  way({ building: "school" }, box(33.2, 26.2, 33.8, 26.8)),
  node({ amenity: "police" }, 38.5, 50.5),
  node({ amenity: "police" }, 39.5, 51.5),
];
function terrain() {
  const out = [];
  for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) out.push(10 + x * 0.5 + 60 * Math.exp(-((x - 58) ** 2 + (y - 30) ** 2) / 30));
  return out;
}
const osm = { area, elements, buildings: true, timestamp: "2026-09-29T00:00:00Z" };
const run = (list, includeBuildings = true) => importer.importOsm({
  osm: { ...osm, elements: list }, elevation: { heights: terrain(), attribution: "Terrain Tiles" }, sim, name: "Fixture",
  includeBuildings, place: "Fixture Place", retrievedAt: "2026-09-29T00:00:00Z",
});
const imported = run(elements);
const p = imported.payload;
const at = (layer, x, y) => p[layer][y * n + x];

// Determinism: the same data in any order is the same city.
const shuffled = elements.slice().reverse();
test.assert(JSON.stringify(run(shuffled).payload) === JSON.stringify(p), "the import does not depend on the order features arrive in");

// Streets.
test.assert(Array.from({ length: n }, (_, x) => at("road", x, 20)).every(Boolean), "a street crossing the square is continuous edge to edge");
test.assert(at("water", 27, 20) === 1 && at("road", 27, 20) === 1, "a street tagged as a bridge keeps the river under it");
const diagonal = [];
for (let y = 5; y <= 17; y += 1) for (let x = 5; x <= 18; x += 1) if (at("road", x, y)) diagonal.push([x, y]);
const joined = diagonal.every(([x, y]) => diagonal.some(([u, v]) => Math.abs(u - x) + Math.abs(v - y) === 1));
test.assert(diagonal.length >= 20 && joined, "a diagonal street becomes an edge-connected staircase");
let blocks = 0;
for (let y = 0; y < n - 1; y += 1) for (let x = 0; x < n - 1; x += 1) {
  if (at("road", x, y) && at("road", x + 1, y) && at("road", x, y + 1) && at("road", x + 1, y + 1)) blocks += 1;
}
test.assert(blocks === 0, `a dual carriageway is thinned to one tile (${blocks} 2x2 road blocks left)`);
test.assert(Array.from({ length: 50 }, (_, k) => at("road", 8 + k, 44) || at("road", 8 + k, 45)).every(Boolean), "the thinned carriageway still runs its whole length");
test.assert([44, 45].every((y) => !at("road", 27, y) || !at("water", 27, y)) && (at("road", 27, 44) || at("road", 27, 45)), "a street not tagged as a bridge lies on dry ground");
test.assert(Array.from({ length: 57 }, (_, y) => at("highway", 50, y)).every(Boolean), "a motorway is a highway line");
const onramps = [];
for (let i = 0; i < n * n; i += 1) if (p.onramp[i]) onramps.push(i);
test.assert(onramps.length >= 1 && onramps.every((i) => {
  const x = i % n; const near = [i - 1, i + 1, i - n, i + n].filter((j) => j >= 0 && j < n * n && (j % n === x || Math.abs((j % n) - x) === 1));
  return near.some((j) => p.highway[j]) && near.some((j) => p.road[j]);
}), "a motorway link joins as an onramp touching both a road and the highway");
test.assert(Array.from({ length: 50 }, (_, y) => y + 5).filter((y) => y !== 20).every((y) => !at("road", 2, y)), "a tunnel stays underground");
test.assert(imported.warnings.some((code) => code.startsWith("tunnels-skipped:")), "the report says tunnels were left out");

// Water.
test.assert(at("water", 26, 10) && !at("salt", 26, 10), "a river is fresh water");
test.assert(Array.from({ length: 5 }, (_, k) => at("water", 10 + k * 10, 61) && at("salt", 10 + k * 10, 61)).every(Boolean), "the sea past the coastline is salt water");
test.assert(!at("water", 10, 56), "land keeps the coastline's left side");
test.assert(at("alt", 10, 62) === 0, "the sea lies at level 0");
const riverLevels = new Set(); for (let y = 0; y < 50; y += 1) for (let x = 25; x < 30; x += 1) if (at("water", x, y) && !at("road", x, y)) riverLevels.add(at("alt", x, y));
test.assert(riverLevels.size === 1, "a body of water lies flat");

// Land cover and zones.
test.assert(at("zone", 6, 30) === 1 && at("zone", 36, 30) === 2, "landuse becomes residential and commercial zones");
test.assert(at("park", 19, 31) === 1 && at("zone", 19, 31) === 0, "a park inside a zone stays a park");
test.assert(at("tree", 58, 10) === 1, "a forest is trees");
test.assert(Array.from({ length: n * n }, (_, i) => !(p.zone[i] && (p.road[i] || p.water[i]))).every(Boolean), "no zone lies on a street or water");

// Heights.
let steep = 0;
for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) {
  const i = y * n + x; if (p.water[i]) continue;
  if (x + 1 < n && !p.water[i + 1] && Math.abs(p.alt[i] - p.alt[i + 1]) > 1) steep += 1;
  if (y + 1 < n && !p.water[i + n] && Math.abs(p.alt[i] - p.alt[i + n]) > 1) steep += 1;
}
test.assert(steep === 0, `dry land is within one step of its neighbours (${steep} steep edges)`);
test.assert(at("alt", 58, 30) > at("alt", 8, 30) + 2, "a real hill stands above the plain");
test.assert(p.alt.every((value) => value >= 0 && value <= 30), "heights stay within the simulation's range");

// Buildings and services.
const anchor = 21 * n + 10;
test.assert(p.lot[anchor] === anchor + 1 && p.stage[anchor] === 3 && p.buildingState[anchor] === 3, "a large footprint on a street becomes a standing 3x3 lot");
test.assert(p.variant[anchor] === 17 && p.density[anchor] === 2, "a twelve-storey block is a high-tier tower on dense land");
const lotAlts = new Set(); for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 3; dx += 1) lotAlts.add(p.alt[anchor + dy * n + dx]);
test.assert(lotAlts.size === 1, "a lot stands on level ground");
const house = 21 * n + 14;
test.assert(p.lot[house] === house + 1 && p.stage[house] === 1 && p.density[house] === 1 && p.zone[house] === 1, "a house becomes a one-tile residential lot on light density");
test.assert(!p.lot[30 * n + 12] && !p.lot[30 * n + 13], "a building with no street is left out");
test.assert(imported.stats.buildingsNoStreet >= 1 && imported.stats.buildingsCivic === 1, "the report counts streetless and civic buildings");
const police = p.facilities.filter((item) => item.kind === "police");
test.assert(police.length === 1 && Math.abs(police[0].x - 38) <= 2 && Math.abs(police[0].y - 50) <= 2, "a police station lands on its own site, mapped twice or not");
const bare = run(elements, false).payload;
test.assert(bare.lot.every((value) => !value), "a bare map imports no buildings");
test.assert(bare.funds < p.funds, "a city that arrives built has the treasury to light it");

// Railway stations: a real station beside the imported track becomes the
// Bonsai train station a Joyride driver can board.
const track = line([4, 10.5], [20, 10.5]);
const stationW = sim.FACILITY_KINDS.station.w; const stationH = sim.FACILITY_KINDS.station.h;
test.assert(stationW === 2 && stationH === 2, "a Bonsai station is a 2x2 site");
const beside = run([
  way({ railway: "rail" }, track),
  // A street and a pond on the ground nearest the station: the footprint has
  // to step off them and still reach the track.
  way({ highway: "residential" }, line([10, 8.5], [13, 8.5])),
  way({ natural: "water" }, box(8, 8, 10, 10)),
  node({ railway: "station" }, 12, 9.5),
]);
const besideStations = beside.payload.facilities.filter((item) => item.kind === "station");
test.assert(beside.stats.stations === 1 && besideStations.length === 1, `a station beside the track becomes exactly one Bonsai train station (got ${beside.stats.stations})`);
const station = besideStations[0];
const footprint = [];
for (let dy = 0; dy < stationH; dy += 1) for (let dx = 0; dx < stationW; dx += 1) footprint.push([station.x + dx, station.y + dy]);
const besideAt = (layer, x, y) => beside.payload[layer][y * n + x];
// The street and the pond take the ground above the track, so the nearest
// free footprint on the track is the one just under it.
test.assert(station.x === 11 && station.y === 11, `the nearest free footprint on the track wins (got ${station.x},${station.y})`);
test.assert(Math.hypot(station.x + stationW / 2 - 12, station.y + stationH / 2 - 9.5) <= 4, "the station stands within four tiles of the OSM station");
test.assert(footprint.every(([x, y]) => ["water", "road", "rail", "highway", "onramp", "lot"].every((layer) => !besideAt(layer, x, y))), "its footprint lies on no water, street, track or lot");
test.assert(footprint.some(([x, y]) => [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < n && y + dy < n && besideAt("rail", x + dx, y + dy))), "and at least one of its tiles touches the track");
test.assert(sim.deserialize(JSON.parse(JSON.stringify(beside.payload))).facilities.some((item) => item.kind === "station"), "the simulation loads the imported station");

// One station mapped twice (its node and its outline) is still one station.
const merged = run([
  way({ railway: "rail" }, track),
  way({ railway: "station" }, box(10.5, 8.5, 14.5, 11.5)),
  node({ railway: "station" }, 12, 9.5),
]);
test.assert(merged.stats.stations === 1 && merged.stats.stationsNoRoom === 0
  && merged.payload.facilities.filter((item) => item.kind === "station").length === 1, "a station's node and its outline a tile apart are one station");
const halts = run([way({ railway: "rail" }, track), node({ railway: "halt" }, 8, 9.5), node({ public_transport: "station", train: "yes" }, 17, 9.5)]);
test.assert(halts.stats.stations === 2, "a halt and a train interchange are stations too");
const stranded = run([way({ railway: "rail" }, track), node({ railway: "station" }, 40, 40)]);
test.assert(stranded.stats.stations === 0 && stranded.stats.stationsNoRoom === 1
  && !stranded.payload.facilities.some((item) => item.kind === "station"), "a station with no track within reach is counted and left for the mayor");
const underground = run([way({ railway: "rail" }, track), node({ railway: "station", station: "subway" }, 12, 9.5), node({ railway: "station", subway: "yes" }, 12, 9.5)]);
test.assert(underground.stats.stations === 0 && underground.stats.stationsNoRoom === 0
  && !underground.payload.facilities.some((item) => item.kind === "station"), "a subway station is out of scope");

// Utilities along streets.
test.assert(Array.from({ length: n * n }, (_, i) => !p.road[i] || (p.water[i] ? !p.pipe[i] : p.pipe[i])).every(Boolean), "every dry street tile carries a water main");
test.assert(Array.from({ length: n * n }, (_, i) => !p.wire[i] || !(p.water[i] || p.rail[i] || p.highway[i] || p.lot[i] || p.zone[i] || p.park[i])).every(Boolean), "power lines run over streets and open ground only");
const wires = p.wire.reduce((sum, value) => sum + value, 0); const streets = p.road.reduce((sum, value) => sum + value, 0);
test.assert(wires >= 1 && wires * 2 < streets, `lines join blocks; they are not a fence down every street (${wires} wire tiles, ${streets} street tiles)`);
test.assert(Array.from({ length: 13 }, (_, k) => at("wire", 15, 22 + k)).filter(Boolean).length === 1, "two blocks either side of a street get exactly one crossing");
test.assert(imported.warnings.includes("no-utility-plants"), "the report says supply is still the mayor's to build");

// Through the simulation.
const state = sim.deserialize(JSON.parse(JSON.stringify(p)));
test.assert(state.lot[anchor] === anchor + 1 && state.provenance?.attribution === "© OpenStreetMap contributors" && state.provenance.license === "ODbL-1.0", "the city opens with its lots and its ODbL provenance");
test.assert(state.provenance.bbox.north === area.north && state.provenance.place === "Fixture Place", "the provenance records where the ground came from");
const again = sim.deserialize(JSON.parse(JSON.stringify(sim.serialize(state))));
test.assert(JSON.stringify(again.provenance) === JSON.stringify(state.provenance), "the provenance survives every save");
test.assert(sim.deserialize({ ...sim.serialize(state), provenance: { source: "x", place: "y".repeat(5000), extra: { a: 1 } } }).provenance.place.length === 400, "a hand-edited provenance is trimmed to known short fields");
test.assert(sim.createCity({ seed: 7, size: 64 }).provenance === null, "a generated city has no outside provenance");
const command = (type, payload) => sim.submitCommand(state, { schemaVersion: 2, type, payload, targetTick: state.tick, clientCommandId: `${type}-${state.nextCommandSequence}` });
let plant = null;
// The plant touches the block east of the street; the lot stands west of it.
for (let x = 16; x < 20 && !plant; x += 1) for (let y = 35; y < 38 && !plant; y += 1) if (command("place-facility", { kind: "coal", x, y }).accepted) plant = { x, y };
test.assert(plant, "the mayor can build a plant against an imported block");
sim.ensureDerived(state);
test.assert(state.powered[anchor] === 1, "power crosses the street to the next block and reaches the imported lot");
sim.advanceTicks(state, 5 * 25);
test.assert(state.population > 0 && Number.isFinite(state.funds), "the imported city runs");

// --- Real names in the provenance ---------------------------------------------
// The gazetteer's records: one entry per named street, place and station, on
// the Bonsai tile the feature landed on. Same synthetic fixtures and the same
// run() path as above.
const names = (result) => result.payload.provenance.names;
const payloadAt = (result, layer, x, y) => result.payload[layer][y * n + x];

// (a) A named primary road becomes a street with its zh/en variants, and its
// tile is a road tile in the payload.
const namedStreet = run([
  way({ highway: "primary", name: "Main Road", "name:zh-Hans": "主路", "name:en": "Main Road" }, line([10.5, 30.5], [40.5, 30.5])),
]);
const namedStreetNames = names(namedStreet);
test.assert(namedStreetNames && namedStreetNames.streets.length === 1, `a named road yields exactly one street entry (got ${namedStreetNames?.streets.length})`);
const mainRoad = namedStreetNames.streets[0];
test.assert(mainRoad.name === "Main Road" && mainRoad.zh === "主路" && !("en" in mainRoad), `the street carries its zh variant and drops en equal to the name (got ${JSON.stringify(mainRoad)})`);
test.assert(payloadAt(namedStreet, "road", mainRoad.x, mainRoad.y) === 1, "the street entry stands on a road tile");

// (b) Two ways with the same name give one entry, placed from the longer way.
const sameName = run([
  way({ highway: "residential", name: "Oak Street" }, line([5.5, 40.5], [15.5, 40.5])),
  way({ highway: "residential", name: "Oak Street" }, line([30.5, 50.5], [55.5, 50.5])),
]);
test.assert(names(sameName).streets.length === 1, `two ways with one name are one street entry (got ${names(sameName).streets.length})`);
const oak = names(sameName).streets[0];
test.assert(oak.x >= 30 && oak.y === 50, `the entry comes from the longer way's middle tile (got ${oak.x},${oak.y})`);

// (c) A road with no name adds nothing.
const unnamedRoad = run([way({ highway: "residential" }, line([5.5, 5.5], [40.5, 5.5]))]);
test.assert(!names(unnamedRoad) || names(unnamedRoad).streets.length === 0, "a road with no name adds no entry");

// (d) A place node inside the square is a place; one outside is not.
const places = run([
  node({ place: "suburb", name: "North Ward" }, 20.5, 20.5),
  node({ place: "suburb", name: "Off Map" }, -5, -5),
]);
const placeNames = names(places).places;
test.assert(placeNames.length === 1 && placeNames[0].name === "North Ward" && placeNames[0].kind === "suburb", `only the in-square suburb is a place (got ${JSON.stringify(placeNames)})`);
test.assert(placeNames[0].x === 20 && placeNames[0].y === 20, `a place sits on its own node's tile (got ${placeNames[0].x},${placeNames[0].y})`);

// (e) A named station node beside imported track names the placed station.
const namedStationRun = run([
  way({ railway: "rail" }, line([4, 20.5], [30, 20.5])),
  node({ railway: "station", name: "Central", "name:en": "Central Station" }, 12, 21.5),
]);
const stationNames = names(namedStationRun).stations;
test.assert(namedStationRun.stats.stations === 1 && stationNames.length === 1, `a named station beside the track is one stations entry (got ${stationNames.length})`);
const namedStation = stationNames[0];
test.assert(payloadAt(namedStationRun, "facilities", 0, 0) !== undefined && namedStationRun.payload.facilities.some((item) => item.kind === "station" && item.x === namedStation.x && item.y === namedStation.y), "the stations entry stands on the placed station facility's tile");
test.assert(namedStation.name === "Central" && namedStation.en === "Central Station", `the station carries its en variant (got ${JSON.stringify(namedStation)})`);

// (f) A map with no names keeps the provenance it had before names travelled.
const anonymous = run([
  way({ highway: "residential" }, line([5.5, 5.5], [40.5, 5.5])),
  node({ place: "suburb" }, 20.5, 20.5),
]);
test.assert(!("names" in anonymous.payload.provenance), "a map with no names has no provenance.names key");

// (g) The same input gives byte-identical provenance.names twice.
const twiceA = run([...elements, node({ place: "suburb", name: "Repeat Ward" }, 30.5, 30.5)]);
const twiceB = run([...elements, node({ place: "suburb", name: "Repeat Ward" }, 30.5, 30.5)]);
test.assert(JSON.stringify(names(twiceA)) === JSON.stringify(names(twiceB)), "running importOsm twice gives byte-identical provenance.names");

// (h) A name longer than 40 characters is trimmed to 40.
const longName = "A".repeat(60);
const trimmed = run([way({ highway: "primary", name: longName }, line([10.5, 30.5], [40.5, 30.5]))]);
test.assert(names(trimmed).streets[0].name.length === 40, `a long name is trimmed to 40 characters (got ${names(trimmed).streets[0].name.length})`);

test.finish();
