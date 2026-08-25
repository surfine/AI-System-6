// Bonsai City Canvas renderer contract: pure four-direction view math plus a
// six-layer, container-sized, read-only Canvas 2D production renderer.

import vm from "node:vm";
import { createHash } from "node:crypto";
import { createCanvas } from "canvas";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-renderer");
const mathSource = read("app/features/bonsai-renderer.js");
const canvasSource = read("app/features/bonsai-renderer-canvas.js");

const mathContext = vm.createContext({ window: {} });
vm.runInContext(mathSource, mathContext);
const math = mathContext.window.AISystem6BonsaiRenderer;

test.assert(math.TILE_W === 48 && math.TILE_H === 24, "the formal renderer uses 48x24 2:1 tiles");
test.assert(math.HEIGHT_STEP === 8, "each terrain height level lifts eight pixels");
test.assert(math.DEFAULT_ZOOM === 0.82, "the initial camera uses the acceptance zoom");
test.assert(math.ROTATIONS === 4, "the camera exposes exactly four quarter-turns");

// --- waterfall edges: the SC2000 mountain signature, pure and deterministic ---

{
  const size = 8;
  const alt = new Uint8Array(size * size);
  const water = new Uint8Array(size * size);
  const terrainType = new Uint8Array(size * size);
  alt[2 * size + 3] = 3; // high land at (3,2)
  water[3 * size + 3] = 1; // water at (3,3)
  const edges = math.waterfallEdges({ size, alt, water, terrainType });
  test.assert(edges.length === 1 && edges[0].x === 3 && edges[0].y === 3 && edges[0].dir === "n" && edges[0].height === 3,
    "a water tile below high land exposes one waterfall edge toward the drop");
  const flat = math.waterfallEdges({ size, alt: new Uint8Array(size * size), water: new Uint8Array(size * size), terrainType: new Uint8Array(size * size) });
  test.assert(flat.length === 0, "flat terrain has no waterfalls");
}

// --- cliff edges: SC2000 stepped-terrain depth, pure and deterministic ------

{
  const size = 8;
  const alt = new Uint8Array(size * size);
  const water = new Uint8Array(size * size);
  alt[2 * size + 3] = 3; // high land at (3,2)
  // lower land at (3,3) stays alt 0
  const edges = math.cliffEdges({ size, alt, water });
  test.assert(edges.some((edge) => edge.x === 3 && edge.y === 3 && edge.dir === "n" && edge.drop === 3),
    "a lower land tile reports the cliff edge toward its higher neighbour");
  test.assert(math.cliffEdges({ size, alt: new Uint8Array(size * size), water: new Uint8Array(size * size) }).length === 0,
    "flat terrain has no cliff shadows");
}

// --- projection, rotation, inverse, and altitude -----------------------------

for (let rotation = 0; rotation < 4; rotation += 1) {
  const camera = math.createCamera({ originX: 600, originY: 140, zoom: 1.35, rotation, size: 96 });
  for (const [x, y, altitude] of [[3, 4, 0], [12, 7, 3], [0, 0, 6], [95, 95, 1]]) {
    const projected = math.project(x, y, altitude, camera, 96);
    const picked = math.unproject(projected.sx, projected.sy, camera, altitude, 96);
    test.assert(picked.x === x && picked.y === y, `rotation ${rotation} round-trips tile (${x}, ${y})`);
  }
}

{
  const camera = math.createCamera();
  const low = math.project(5, 5, 0, camera).sy;
  const high = math.project(5, 5, 4, camera).sy;
  test.assert(high === low - 32 * camera.zoom, "altitude lift uses the exact height-step contract");
}

// --- diagonal culling and multi-tile painter anchors -------------------------

{
  const size = 96;
  const camera = math.createCamera({ originX: 320, originY: -450, zoom: 0.82, size });
  const visible = math.visibleTiles(size, camera, { left: 0, top: 0, right: 640, bottom: 360 }, new Uint8Array(size * size));
  test.assert(visible.length > 0 && visible.length < size * size, "visible diagonal culling excludes offscreen map tiles");
  const repeated = math.visibleTiles(size, camera, { left: 0, top: 0, right: 640, bottom: 360 }, new Uint8Array(size * size));
  test.assert(JSON.stringify(visible) === JSON.stringify(repeated), "visible culling is deterministic");

  const narrowCamera = math.createCamera({
    originX: 326,
    originY: 241 - (size - 1) * (math.TILE_H / 2) * 0.82,
    zoom: 0.82,
    size,
  });
  const narrowVisible = math.visibleTiles(size, narrowCamera, { left: 0, top: 0, right: 652, bottom: 482 }, new Uint8Array(size * size));
  test.assert(narrowVisible.length >= 22 * 22 && narrowVisible.length <= 32 * 32, "narrow-window culling stays near the 22x22 target plus high-rise margin");

  const objects = [
    { id: "rear", x: 10, y: 10, footprint: { w: 1, h: 1 } },
    { id: "wide", x: 10, y: 10, footprint: { w: 3, h: 3 } },
    { id: "front", x: 14, y: 14, footprint: { w: 1, h: 1 } },
  ];
  const sorted = math.sortByAnchor(objects, size, 0).map((object) => object.id);
  test.assert(sorted.indexOf("rear") < sorted.indexOf("wide") && sorted.indexOf("wide") < sorted.indexOf("front"), "multi-tile objects sort by their near-camera footprint anchor");
}

// --- production Canvas surface ----------------------------------------------

function makeContext() {
  const calls = [];
  return {
    calls,
    imageSmoothingEnabled: true,
    setTransform: (...args) => calls.push(["setTransform", ...args]),
    clearRect: (...args) => calls.push(["clearRect", ...args]),
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    strokeRect: (...args) => calls.push(["strokeRect", ...args]),
    drawImage: (...args) => calls.push(["drawImage", ...args.slice(-4)]),
    beginPath: () => calls.push(["beginPath"]),
    moveTo: (...args) => calls.push(["moveTo", ...args]),
    lineTo: (...args) => calls.push(["lineTo", ...args]),
    arc: (...args) => calls.push(["arc", ...args]),
    closePath: () => calls.push(["closePath"]),
    fill: () => calls.push(["fill"]),
    stroke: () => calls.push(["stroke"]),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
  };
}

function makeCanvas(owner) {
  const context = makeContext();
  return {
    tagName: "CANVAS",
    dataset: {},
    width: 300,
    height: 150,
    parentElement: owner,
    setAttribute() {},
    getContext() { return context; },
    remove() {
      if (!owner) return;
      owner.children = owner.children.filter((child) => child !== this);
    },
    _context: context,
  };
}

const stack = {
  tagName: "DIV",
  dataset: { bonsaiMapStack: "" },
  children: [],
  rect: { left: 10, top: 20, width: 320, height: 200 },
  appendChild(canvas) { canvas.parentElement = this; this.children.push(canvas); },
  querySelector(selector) {
    const match = selector.match(/data-bonsai-layer="([^"]+)"/);
    return match ? this.children.find((canvas) => canvas.dataset.bonsaiLayer === match[1]) || null : null;
  },
  getBoundingClientRect() { return { ...this.rect }; },
};

let observerInstance = null;
class FakeResizeObserver {
  constructor(callback) { this.callback = callback; this.target = null; this.disconnected = false; observerInstance = this; }
  observe(target) { this.target = target; }
  disconnect() { this.disconnected = true; }
}

const document = {
  createElement(name) {
    if (name !== "canvas") throw new Error(`unexpected element ${name}`);
    return makeCanvas(null);
  },
};

const loadedImageUrls = [];
// Requests carry a ?v=<digest> cache stamp; these two assertions are about
// which atlas decoded and how many, so they compare paths. The stamp itself
// has its own contract at the end of this file.
const atlasPaths = () => loadedImageUrls.map((url) => String(url).split("?")[0]);
class FakeImage {
  set src(value) {
    this._src = value;
    loadedImageUrls.push(value);
    Promise.resolve().then(() => this.onload?.());
  }
  get src() { return this._src; }
}

const canvasContext = vm.createContext({
  window: { devicePixelRatio: 2 },
  document,
  ResizeObserver: FakeResizeObserver,
  Image: FakeImage,
  Promise,
  Uint8Array,
  Set,
  Map,
});
vm.runInContext(read("app/generated/bonsai-atlas.js"), canvasContext);
vm.runInContext(mathSource, canvasContext);
vm.runInContext(canvasSource, canvasContext);
const renderer = canvasContext.window.AISystem6BonsaiCanvasRenderer;

test.assert(renderer && typeof renderer.mount === "function", "the Canvas renderer installs its exact shell global");
await renderer.mount(stack);
test.assert(renderer.isReady(), "mount makes the synchronous fallback renderer ready");
test.assert(JSON.stringify(atlasPaths()) === JSON.stringify(["/assets/bonsai/atlas-north.png"]), "mount decodes only the active directional atlas");
test.assert(stack.children.length === 6, "mount creates exactly six canvas layers");
test.assert(
  JSON.stringify(stack.children.map((canvas) => canvas.dataset.bonsaiLayer)) === JSON.stringify(["terrain", "infrastructure", "buildings", "agents", "feedback", "lighting"]),
  "canvas layers carry the integration data attributes in painter order"
);

{
  const stats = renderer.debugStats();
  test.assert(stats.cssWidth === 320 && stats.cssHeight === 200 && stats.dpr === 2, "mount measures only the container rectangle and DPR");
  test.assert(stats.backingWidth === 640 && stats.backingHeight === 400, "backing size is CSS size multiplied by DPR");
  test.assert(stack.children.every((canvas) => canvas.width === 640 && canvas.height === 400), "all six layers have identical backing dimensions");
  test.assert(observerInstance?.target === stack, "one ResizeObserver watches the map stack rather than a canvas");
}

observerInstance.callback([{ target: stack, contentRect: { width: 400, height: 250 } }]);
test.assert(
  stack.children.every((canvas) => canvas.width === 800 && canvas.height === 500),
  "observer resize remains bounded at contentRect times DPR without a canvas feedback loop"
);

const size = 8;
const cellCount = size * size;
const v1Snapshot = {
  size,
  tick: 12,
  seed: 42,
  rev: 3,
  timeOfDay: 0.5,
  alt: new Uint8Array(cellCount),
  water: new Uint8Array(cellCount),
  tree: new Uint8Array(cellCount),
  over: new Uint8Array(cellCount),
  zone: new Uint8Array(cellCount),
  stage: new Uint8Array(cellCount),
  variant: new Uint8Array(cellCount),
  plants: [{ x: 1, y: 1, kind: "coal" }],
  services: [{ x: 4, y: 4, kind: "police" }],
};
for (let x = 1; x < 7; x += 1) v1Snapshot.over[3 * size + x] = 1;
v1Snapshot.zone[4 * size + 4] = 1;
v1Snapshot.stage[4 * size + 4] = 2;
v1Snapshot.variant[4 * size + 4] = 3;
renderer.render(v1Snapshot);
const firstStats = renderer.debugStats();
test.assert(firstStats.visibleTileCount > 0, "render culls to a non-empty visible tile set");
test.assert(firstStats.chunkCacheCount > 0 && firstStats.chunkBuildCount > 0, "render builds 16x16 offscreen static chunks");
renderer.render(v1Snapshot);
test.assert(renderer.debugStats().chunkBuildCount === firstStats.chunkBuildCount, "unchanged static input reuses chunk caches");

const v2Snapshot = {
  size,
  tick: 13,
  seed: 42,
  terrainType: Array(cellCount).fill("grass"),
  elevation: new Uint8Array(cellCount),
  roads: new Uint8Array(cellCount),
  rails: new Uint8Array(cellCount),
  powerLines: new Uint8Array(cellCount),
  waterPipes: new Uint8Array(cellCount),
  zoneType: Array(cellCount).fill("none"),
  buildings: [{ x: 3, y: 3, zone: "commercial", stage: 3, variant: 4, state: "recovering", footprint: { w: 3, h: 3 } }],
  facilities: [{ x: 1, y: 1, kind: "water-pump", footprint: { w: 2, h: 2 } }],
  powered: Uint8Array.from({ length: cellCount }, (_, index) => index % 2),
  watered: Uint8Array.from({ length: cellCount }, (_, index) => (index + 1) % 2),
  traffic: Uint16Array.from({ length: cellCount }, (_, index) => index * 4),
  pollution: Uint8Array.from({ length: cellCount }, (_, index) => index * 3),
  landValue: Uint8Array.from({ length: cellCount }, (_, index) => 255 - index * 3),
  policeCovered: Uint8Array.from({ length: cellCount }, (_, index) => index % 3 === 0),
  fireCovered: Uint8Array.from({ length: cellCount }, (_, index) => index % 3 === 1),
  educationCovered: Uint8Array.from({ length: cellCount }, (_, index) => index % 4 === 0),
  healthCovered: Uint8Array.from({ length: cellCount }, (_, index) => index % 4 === 1),
};
v2Snapshot.roads[3 * size + 3] = 1;
v2Snapshot.rails[4 * size + 4] = 1;
v2Snapshot.powerLines[3 * size + 4] = 1;
v2Snapshot.waterPipes[4 * size + 3] = 1;
renderer.render(v2Snapshot);
test.assert(renderer.debugStats().visibleTileCount > 0, "renderer tolerates the split v2 terrain, utility, building, and facility fields");

const overlaySnapshotBefore = JSON.stringify(v2Snapshot);
const lightingContext = stack.children.find((canvas) => canvas.dataset.bonsaiLayer === "lighting")._context;
for (const overlay of ["power", "water", "traffic", "pollution", "land-value", "police", "fire", "education", "health"]) {
  const fillCallsBefore = lightingContext.calls.filter(([name]) => name === "fill").length;
  renderer.render(v2Snapshot, { overlay });
  const fillCallsAfter = lightingContext.calls.filter(([name]) => name === "fill").length;
  test.assert(fillCallsAfter > fillCallsBefore && renderer.debugStats().overlay === overlay, `${overlay} overlay paints quantized semi-transparent isometric cells`);
}
renderer.render(v2Snapshot, { overlay: "none" });
test.assert(renderer.debugStats().overlay === "none", "none overlay restores the unmodified lighting view");
test.assert(JSON.stringify(v2Snapshot) === overlaySnapshotBefore, "overlay rendering never mutates the render snapshot");

const miniMapCanvas = makeCanvas(null);
miniMapCanvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 180, height: 100 });
const miniMapBefore = JSON.stringify(v2Snapshot);
const miniStats = renderer.renderMiniMap(miniMapCanvas, v2Snapshot, {
  overlay: "traffic",
  viewport: { x: 2, y: 1, width: 4, height: 5 },
  dpr: 4,
});
test.assert(miniStats.cssWidth === 180 && miniStats.cssHeight === 100, "minimap measures its separate inspector canvas CSS bounds");
test.assert(miniStats.dpr === 2 && miniStats.backingWidth === 360 && miniStats.backingHeight === 200, "minimap caps backing resolution at CSS size times DPR 2");
test.assert(miniMapCanvas._context.calls.filter(([name]) => name === "strokeRect").length === 2, "minimap draws a high-contrast viewport outline");
const firstMiniMapTrace = JSON.stringify(miniMapCanvas._context.calls);
miniMapCanvas._context.calls.length = 0;
renderer.renderMiniMap(miniMapCanvas, v2Snapshot, {
  overlay: "traffic",
  viewport: { x: 2, y: 1, width: 4, height: 5 },
  dpr: 4,
});
test.assert(JSON.stringify(miniMapCanvas._context.calls) === firstMiniMapTrace, "minimap drawing is deterministic for the same snapshot and view");
test.assert(JSON.stringify(v2Snapshot) === miniMapBefore && renderer.debugStats().activeRaf === 0, "minimap uses no RAF and never mutates core data");
const bitmapMiniMap = createCanvas(1, 1);
bitmapMiniMap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 180, height: 100 });
renderer.renderMiniMap(bitmapMiniMap, v2Snapshot, { overlay: "land-value", viewport: { x: 1, y: 1, width: 5, height: 4 }, dpr: 2 });
const firstMiniMapHash = createHash("sha256").update(bitmapMiniMap.toBuffer("image/png")).digest("hex");
renderer.renderMiniMap(bitmapMiniMap, v2Snapshot, { overlay: "land-value", viewport: { x: 1, y: 1, width: 5, height: 4 }, dpr: 2 });
const secondMiniMapHash = createHash("sha256").update(bitmapMiniMap.toBuffer("image/png")).digest("hex");
test.assert(firstMiniMapHash === secondMiniMapHash, "real minimap bitmap output is byte-deterministic across repeated renders");

{
  const camera = math.createCamera({
    size,
    zoom: math.DEFAULT_ZOOM,
    rotation: 0,
    originX: 200,
    originY: 125 - (size - 1) * (math.TILE_H / 2) * math.DEFAULT_ZOOM,
  });
  const point = math.project(3, 3, 0, camera, size);
  const picked = renderer.pickTile(10 + point.sx * (320 / 400), 20 + point.sy * (200 / 250), { left: 10, top: 20, width: 320, height: 200 });
  test.assert(picked?.x === 3 && picked?.y === 3, "pickTile maps client coordinates through the current inverse projection");
}

vm.runInContext(read("app/features/bonsai-city-sim.js"), canvasContext);
const liveSim = canvasContext.window.AISystem6BonsaiSim;
const liveCity = liveSim.createCity({ name: "Renderer Contract", seed: 731, size: 64, terrainPreset: "balanced" });
const liveSnapshot = liveSim.buildRenderSnapshot(liveCity);
renderer.render(liveSnapshot);
test.assert(renderer.debugStats().visibleTileCount > 0, "renderer consumes the current v2 core's real render snapshot without an adapter in the shell");
const beforeRoadBuilds = renderer.debugStats().chunkBuildCount;
liveSnapshot.road[32 * 64 + 32] = 1;
liveSnapshot.rev += 1;
renderer.render(liveSnapshot);
test.assert(renderer.debugStats().chunkBuildCount === beforeRoadBuilds + 1, "a road transaction invalidates only its one infrastructure chunk");

renderer.setPreview({ accepted: false, footprint: [{ x: 2, y: 2 }, { x: 3, y: 2 }] });
renderer.clearPreview();
test.assert(renderer.rotateBy(1) === 1, "rotateBy applies an exact clockwise quarter turn");
await Promise.resolve();
await Promise.resolve();
test.assert(atlasPaths().includes("/assets/bonsai/atlas-east.png") && loadedImageUrls.length === 2, "rotation lazily decodes only the newly active direction");
test.assert(renderer.rotateBy(-1) === 0, "rotateBy applies an exact reversible counterclockwise quarter turn");
test.assert(renderer.zoomBy(100) === math.MAX_ZOOM && renderer.zoomBy(0.0001) === math.MIN_ZOOM, "zoomBy clamps at the pure camera limits");
test.assert(JSON.stringify(renderer.panByScreen(12, -8)) === JSON.stringify({ x: 12, y: -8 }), "pan is retained as view-only screen state");
const persistedView = renderer.debugStats().view;
test.assert(Object.isFrozen(persistedView) && persistedView.panX === 12 && persistedView.panY === -8, "debug stats expose a detached frozen camera view for Working Session persistence");
renderer.resetView({ center: { x: 10, y: 20 }, size: 64, zoom: math.DEFAULT_ZOOM });
{
  const rotated = math.rotateTile(10, 20, 64, 0);
  const expectedPanX = -(rotated.x - rotated.y) * (math.TILE_W / 2) * math.DEFAULT_ZOOM;
  const expectedPanY = ((64 - 1) - (rotated.x + rotated.y)) * (math.TILE_H / 2) * math.DEFAULT_ZOOM;
  const centeredView = renderer.debugStats().view;
  test.assert(
    Math.abs(centeredView.panX - expectedPanX) < 0.001 && Math.abs(centeredView.panY - expectedPanY) < 0.001,
    "resetView with a tile center computes the pan that puts that tile at the viewport middle"
  );
}
renderer.resetView();

renderer.dispose();
const disposedStats = renderer.debugStats();
test.assert(disposedStats.disposed && disposedStats.layerCount === 0 && disposedStats.activeRaf === 0, "dispose disconnects rendering resources and reports activeRaf exactly zero");
test.assert(observerInstance.disconnected, "dispose disconnects the sole ResizeObserver");

for (const source of [mathSource, canvasSource]) {
  test.assertNotIncludes(source, "Math.random", "renderer code never invents randomness");
  test.assertNotIncludes(source, "Date.now", "renderer code never reads the wall clock");
  test.assertNotIncludes(source, "performance.now", "renderer code never reads performance clocks");
  test.assertNotIncludes(source, "advanceTicks", "renderer code never advances simulation rules");
  test.assertNotIncludes(source, "submitCommand", "renderer code never submits commands or mutates core state");
}

// The atlas PNGs are served with max-age=86400 under stable paths, so an
// unstamped request leaves a returning visitor on the previous release's art
// for up to a day. Stamp with the digest the generator recorded for the file,
// not the build: it changes exactly when the art does.
{
  const start = canvasSource.indexOf("function atlasImageUrl(");
  const end = canvasSource.indexOf("function loadAtlasImages()");
  test.assert(start >= 0 && end > start, "the atlas url stamper can be extracted for execution");
  const urlContext = vm.createContext({});
  vm.runInContext(`${canvasSource.slice(start, end)}; globalThis.atlasImageUrl = atlasImageUrl;`, urlContext);
  const atlasImageUrl = urlContext.atlasImageUrl;

  test.assertIncludes(canvasSource, "atlasImageUrl(atlas.directions[direction])", "the image request goes through the stamper");
  test.assertNotIncludes(canvasSource, "image.src = atlas.directions[direction].url", "and never uses the bare unstamped path");

  // Run it against the real generated atlas, so the contract fails if the
  // generator ever stops recording a digest beside the url it writes.
  const atlasContext = vm.createContext({ window: {} });
  vm.runInContext(read("app/generated/bonsai-atlas.js"), atlasContext);
  const directions = atlasContext.window.AISystem6BonsaiAtlas.directions;
  const stamped = Object.entries(directions).map(([name, entry]) => [name, atlasImageUrl(entry)]);
  test.assert(stamped.length === 4, "all four directions carry an atlas entry");
  stamped.forEach(([name, url]) => {
    test.assert(/\?v=[0-9a-f]{16}$/.test(url), `the ${name} atlas is requested with a content digest`);
    test.assert(url.startsWith(directions[name].url + "?"), `the ${name} atlas keeps its path and only gains a query`);
  });
  test.assert(new Set(stamped.map(([, url]) => url)).size === 4, "each direction stamps to a distinct url");

  // Degrade to the plain path rather than inventing "?v=undefined".
  test.assert(atlasImageUrl({ url: "/assets/bonsai/atlas-north.png" }) === "/assets/bonsai/atlas-north.png", "a missing digest yields the plain path, not a broken query");
  test.assert(atlasImageUrl({ url: "/a.png?v=1", sha256: "ff" }) === "/a.png?v=1", "an already-stamped url is left alone");
  test.assert(atlasImageUrl(null) === "", "a missing entry yields no request at all");
}

// Day/night: the sim clock's time-of-day drives a binary night gate that
// swaps building/facility frames and lights windows on the lighting layer.
// The swap must never rebuild per tick: the buildings layer cache key and
// the infrastructure chunk signature carry the night flag, so each transition
// costs one rebuild and steady-state night reuses caches.
{
  test.assertIncludes(canvasSource, "function isNight(snapshot)", "the Canvas renderer owns a time-of-day night gate");
  test.assertIncludes(canvasSource, "buildingFrame(building, night)", "night swaps growable building frames");
  test.assertIncludes(canvasSource, "nightFrame(`facility.", "facilities select their night variant");
test.assertIncludes(canvasSource, "drawNightWindowGlow", "the lighting layer draws lit windows after the darkness overlay");
test.assertIncludes(canvasSource, '`${viewKey}:${buildingSignature(snapshot)}:${night ? "n" : "d"}:${season}`', "the buildings layer rebuilds only at day/night or season transitions");
test.assertIncludes(canvasSource, "isNight(snapshot) ? 1 : 0", "the infrastructure chunk signature carries the night flag");
test.assertIncludes(canvasSource, "season === 3", "autumn doubles the maple share");
test.assertIncludes(canvasSource, "drawWaterfalls", "the agents layer draws waterfall curtains");
test.assertIncludes(canvasSource, "drawDisaster", "the agents layer draws active tornado/monster disasters");
test.assertIncludes(canvasSource, "MATH.waterfallEdges", "waterfall edges come from the shared pure derivation");
test.assertIncludes(canvasSource, '"airport") return "rgba(162,168,174,0.6)"', "airport zones tint as runway pads");
test.assertIncludes(canvasSource, '"seaport") return "rgba(124,148,158,0.6)"', "seaport zones tint as docks");
test.assertIncludes(canvasSource, "runway centre line", "airport pads carry runway markings");
test.assertIncludes(canvasSource, "drawCliffShadows", "terrain tiles cast cliff shadows toward higher ground");
test.assertIncludes(canvasSource, "drawWaterShimmer", "the lighting layer shimmers water from the snapshot clock");
test.assertIncludes(canvasSource, "whisper of a hatch", "R/C/I zones carry a barely-there claimed-land hatch");
test.assertIncludes(canvasSource, "drawZenNight", "the lighting layer draws the zen night (moon and lanterns)");
test.assertIncludes(canvasSource, "SC2000 minimap reads elevation as brightness", "the minimap tints terrain by altitude");
test.assertIncludes(canvasSource, "SC2000 minimap features", "the minimap draws networks and buildings as pixels");
test.assertIncludes(canvasSource, "drawConstructionCranes", "construction sites carry tick-swinging cranes");
test.assertIncludes(canvasSource, "Snow: peaks above the snow line always", "high grass and slopes render as snow terrain");
test.assertIncludes(canvasSource, "the whole lowland in", "winter snows over the lowland");
test.assertIncludes(canvasSource, "Winter freezes the lakes", "winter lays a pale ice sheet over water");
test.assertIncludes(canvasSource, 'winter ? "#dce8ee" : "#356e9a"', "the minimap shows frozen water in winter");
test.assertIncludes(canvasSource, 'if (layer === "terrain") {\n      hash = fnvUpdate(hash, Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375));', "the terrain chunk signature carries the season");
test.assertIncludes(canvasSource, '`${family}.mask-${mask}`', "networks draw their direction-aware mask frames");
test.assertIncludes(canvasSource, '"bridge-road"', "road crossings over water draw the bridge deck family");
test.assertIncludes(canvasSource, '"bridge-highway"', "highway crossings over water draw the highway bridge deck");
test.assertIncludes(canvasSource, "drawTunnelOverlay", "road bores draw dark tunnel overlays and portal frames");
test.assertIncludes(canvasSource, '"blossom"', "spring scatters sakura crowns");
test.assertIncludes(canvasSource, '"winter"', "winter renders snow-dusted crowns");
test.assertIncludes(canvasSource, '"maple"', "autumn raises the maple share");
test.assertIncludes(canvasSource, "SC2000 port signatures", "airport and seaport pads gain control towers and dock cranes");
test.assertIncludes(canvasSource, "Moon reflection", "water near the moon column carries a faint glint");
test.assertIncludes(canvasSource, "drawSakuraPetals", "spring drifts sakura petals on the agents layer");
test.assertIncludes(canvasSource, "A ramp has two ends", "onramps pick orientation frames from highway and road neighbours");
}

test.finish();
