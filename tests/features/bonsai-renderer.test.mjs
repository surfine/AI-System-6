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

test.assert(math.TILE_W === 64 && math.TILE_H === 32, "the formal renderer uses 64x32 2:1 tiles");
test.assert(math.HEIGHT_STEP === 10, "each terrain height level lifts ten pixels");
test.assert(math.DEFAULT_ZOOM === 0.5, "the initial camera opens at the SC2K 32px overview step");
test.assert(JSON.stringify(math.ZOOM_LEVELS) === "[0.25,0.5,1,2]" && math.MIN_ZOOM === 0.25 && math.MAX_ZOOM === 2, "zoom moves between four whole-number-friendly steps");
test.assert(math.snapZoom(0.7) === 0.5 && math.snapZoom(0.75) === 1 && math.snapZoom(9) === 2 && math.snapZoom(0.01) === 0.25, "arbitrary scales snap to the nearest step in doublings");
test.assert(math.stepZoom(0.5, 1) === 1 && math.stepZoom(0.5, -1) === 0.25 && math.stepZoom(2, 1) === 2 && math.stepZoom(0.25, -3) === 0.25, "a step moves one level and stops at the ends");
{
  // The ground under the anchor stays put: centre + pan + zoom x offset.
  const from = 0.5; const to = 1; const width = 800; const height = 600;
  const view = { panX: 37, panY: -21 };
  const anchor = { x: 610, y: 145 };
  const worldX = (anchor.x - width / 2 - view.panX) / from;
  const worldY = (anchor.y - height / 2 - view.panY) / from;
  const next = math.anchoredPan(view, from, to, anchor.x, anchor.y, width, height);
  test.assert(Math.abs(width / 2 + next.panX + to * worldX - anchor.x) < 1e-9 && Math.abs(height / 2 + next.panY + to * worldY - anchor.y) < 1e-9,
    "anchored zoom keeps the point under the pointer on the same screen pixel");
  const centred = math.anchoredPan(view, from, to, undefined, undefined, width, height);
  test.assert(centred.panX === view.panX * 2 && centred.panY === view.panY * 2, "without an anchor, zoom holds the middle of the view");
}
test.assert(math.seasonOf({ tick: 400, season: 1 }) === 1 && math.seasonOf({ tick: 400 }) === 1 && math.seasonOf({ tick: 1200 }) === 3 && math.seasonOf({ tick: 1200, season: 0 }) === 0,
  "a stamped season wins over the clock; an unstamped snapshot keeps the clock");
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
  test.assert(high === low - 40 * camera.zoom, "altitude lift uses the exact height-step contract");
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
  const images = [];
  // The source rectangle of every drawImage, in call order: which atlas frame
  // a tile was drawn with is not visible in the destination rect the `calls`
  // trace keeps, and some contracts are about exactly that.
  const sourceRects = [];
  return {
    calls, images, sourceRects,
    imageSmoothingEnabled: true,
    setTransform: (...args) => calls.push(["setTransform", ...args]),
    clearRect: (...args) => calls.push(["clearRect", ...args]),
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    strokeRect: (...args) => calls.push(["strokeRect", ...args]),
    drawImage: (...args) => {
      images.push(args[0]);
      if (args.length >= 9) sourceRects.push(args.slice(1, 5));
      calls.push(["drawImage", ...args.slice(-4)]);
    },
    save: () => calls.push(["save"]),
    translate: (...args) => calls.push(["translate", ...args]),
    scale: (...args) => calls.push(["scale", ...args]),
    restore: () => calls.push(["restore"]),
    transform: (...args) => calls.push(["transform", ...args]),
    rect: (...args) => calls.push(["rect", ...args]),
    clip: () => calls.push(["clip"]),
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
test.assert(miniStats.rasterized === false, "minimap keeps the direct fillRect fallback for contexts that cannot round-trip ImageData");
// The fallback still paints terrain, features, and the overlay tile by tile,
// so the feature pixels are never dropped on the doubles.
const miniMapFills = miniMapCanvas._context.calls.filter(([name]) => name === "fillRect");
test.assert(miniMapFills.length === 1 + cellCount * 2 + 4,
  "minimap fallback draws the background, every terrain and overlay cell, and each of the four network feature pixels");
test.assert(miniMapFills.filter(([, , , width, height]) => width === 1 && height === 1).length === 4,
  "minimap fallback keeps all four road/rail/wire/pipe pixels at their feature centers");
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
// The harness's document doubles cannot round-trip ImageData, so the real
// bitmap path gets a real scratch surface. In a browser the document canvas
// fills this role; the hook is what keeps the raster path exercised here.
const scratchCanvases = [];
const createScratchCanvas = () => { const scratch = createCanvas(1, 1); scratchCanvases.push(scratch); return scratch; };
const bitmapOptions = { overlay: "land-value", viewport: { x: 1, y: 1, width: 5, height: 4 }, dpr: 2, createScratchCanvas };
const bitmapStats = renderer.renderMiniMap(bitmapMiniMap, v2Snapshot, bitmapOptions);
const firstMiniMapHash = createHash("sha256").update(bitmapMiniMap.toBuffer("image/png")).digest("hex");
renderer.renderMiniMap(bitmapMiniMap, v2Snapshot, bitmapOptions);
const secondMiniMapHash = createHash("sha256").update(bitmapMiniMap.toBuffer("image/png")).digest("hex");
test.assert(firstMiniMapHash === secondMiniMapHash, "real minimap bitmap output is byte-deterministic across repeated renders");
test.assert(bitmapStats.rasterized === true, "a real 2D context takes the single ImageData raster path");
test.assert(scratchCanvases.length === 1 && scratchCanvases[0].width === 180 && scratchCanvases[0].height === 100,
  "minimap reuses one CSS-resolution scratch canvas per target instead of allocating per frame");

{
  // Assert the uploaded bitmap itself, not the call trace: the minimap is a
  // 180x100 CSS picture at DPR 2, so CSS pixel (px, py) is the 2x2 device block
  // at (px * 2, py * 2). Every expected value below is the plain source-over of
  // the snapshot's own terrain/feature/overlay colors.
  const bitmapContext = bitmapMiniMap.getContext("2d");
  const devicePixel = (px, py) => [...bitmapContext.getImageData(px * 2, py * 2, 1, 1).data];

  // Tile (0, 0) is grass at altitude 0 — 99/147/84 lifted by (0 - 4) * 6 — with
  // a land-value bucket 4 tint (landValue 255) over it.
  test.assert(JSON.stringify(devicePixel(0, 0)) === JSON.stringify([58, 125, 66, 255]),
    "minimap raster paints the elevation-lifted terrain color under the land-value overlay");

  // Tile (3, 3) carries the road at index 27: its dark network pixel is then
  // covered by that tile's own land-value tint, exactly as the fillRect order
  // did. Feature center is floor((67 + 90) / 2), floor((37 + 50) / 2) => 78, 43.
  test.assert(JSON.stringify(devicePixel(78, 43)) === JSON.stringify([53, 79, 44, 255]),
    "minimap raster keeps the road's dark feature pixel under the tile overlay");

  // The same tile with no overlay isolates the network feature color over the
  // grass base: rgba(24,26,24,0.92) over 75/123/60.
  const featureMiniMap = createCanvas(1, 1);
  featureMiniMap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 180, height: 100 });
  renderer.renderMiniMap(featureMiniMap, v2Snapshot, { viewport: { x: 1, y: 1, width: 5, height: 4 }, dpr: 2, createScratchCanvas });
  const featurePixel = [...featureMiniMap.getContext("2d").getImageData(78 * 2, 43 * 2, 1, 1).data];
  test.assert(JSON.stringify(featurePixel) === JSON.stringify([28, 34, 27, 255]),
    "minimap raster paints the road pixel in its dark network color over the terrain");

  // Water is skipped by the overlay, so its tile keeps the plain water color.
  const waterSnapshot = { ...v2Snapshot, water: new Uint8Array(cellCount) };
  waterSnapshot.water[0] = 1;
  const waterMiniMap = createCanvas(1, 1);
  waterMiniMap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 180, height: 100 });
  renderer.renderMiniMap(waterMiniMap, waterSnapshot, { overlay: "land-value", viewport: { x: 1, y: 1, width: 5, height: 4 }, dpr: 2, createScratchCanvas });
  const waterPixel = [...waterMiniMap.getContext("2d").getImageData(0, 0, 1, 1).data];
  test.assert(JSON.stringify(waterPixel) === JSON.stringify([53, 110, 154, 255]),
    "minimap raster leaves water tiles unshaded by the overlay");

  // Buildings and facilities take the light pixel: stage 3 at (3, 3) would be a
  // building pixel if the road were not painted first, so probe the facility
  // tile (1, 1) instead, which has a water-pump footprint and no network.
  const buildingSnapshot = { ...v2Snapshot, facilityAt: Array(cellCount).fill(-1), zone: new Uint8Array(cellCount) };
  buildingSnapshot.facilityAt[1 * size + 1] = 0;
  const buildingMiniMap = createCanvas(1, 1);
  buildingMiniMap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 180, height: 100 });
  renderer.renderMiniMap(buildingMiniMap, buildingSnapshot, { viewport: { x: 1, y: 1, width: 5, height: 4 }, dpr: 2, createScratchCanvas });
  // Tile (1, 1): left 22, right 45, top 12, bottom 25 => feature center 33, 18.
  const buildingPixel = [...buildingMiniMap.getContext("2d").getImageData(33 * 2, 18 * 2, 1, 1).data];
  test.assert(JSON.stringify(buildingPixel) === JSON.stringify([224, 223, 206, 255]),
    "minimap raster paints facility tiles with the light building pixel");
}

{
  // A host with neither OffscreenCanvas nor ImageData round-tripping — the
  // shape of an old shim — must still draw the whole minimap.
  const fallbackContext = vm.createContext({
    window: { devicePixelRatio: 1 },
    document,
    Promise,
    Uint8Array,
    Set,
    Map,
  });
  vm.runInContext(mathSource, fallbackContext);
  vm.runInContext(canvasSource, fallbackContext);
  const fallbackRenderer = fallbackContext.window.AISystem6BonsaiCanvasRenderer;
  const fallbackMiniMap = makeCanvas(null);
  fallbackMiniMap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 64, height: 64 });
  const fallbackStats = fallbackRenderer.renderMiniMap(fallbackMiniMap, v2Snapshot, { overlay: "traffic", dpr: 1 });
  test.assert(fallbackStats && fallbackStats.rasterized === false && fallbackStats.backingWidth === 64,
    "minimap without any image-capable canvas reports the fillRect fallback at CSS resolution");
  const fallbackFills = fallbackMiniMap._context.calls.filter(([name]) => name === "fillRect");
  test.assert(fallbackFills.length === 1 + cellCount * 2 + 4,
    "minimap fillRect fallback paints every terrain cell, every overlay cell, and each network pixel");
}

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
{
  const typed = { ...liveSnapshot, season: 3 };
  const compatible = Object.fromEntries(Object.entries(typed).map(([key, value]) =>
    [key, ArrayBuffer.isView(value) ? Array.from(value) : value]));
  const options = { ...bitmapOptions, overlay: "none" };
  renderer.renderMiniMap(bitmapMiniMap, typed, options);
  const typedPixels = bitmapMiniMap.toBuffer("image/png");
  renderer.renderMiniMap(bitmapMiniMap, compatible, options);
  test.assert(typedPixels.equals(bitmapMiniMap.toBuffer("image/png")),
    "real city typed grids and compatible array snapshots produce identical winter minimaps");
}
renderer.render(liveSnapshot);
test.assert(renderer.debugStats().visibleTileCount > 0, "renderer consumes the current v2 core's real render snapshot without an adapter in the shell");
const beforeRoadBuilds = renderer.debugStats().chunkBuildCount;
liveSnapshot.road[32 * 64 + 32] = 1;
liveSnapshot.rev += 1;
renderer.render(liveSnapshot);
test.assert(renderer.debugStats().chunkBuildCount === beforeRoadBuilds + 1, "a road transaction invalidates only its one infrastructure chunk");
{
  // Widening two streets into an avenue changes no layer but the avenue's,
  // and the chunk still repaints.
  liveSnapshot.road[33 * 64 + 32] = 1;
  liveSnapshot.rev += 1;
  renderer.render(liveSnapshot);
  const beforeAvenue = renderer.debugStats().chunkBuildCount;
  liveSnapshot.avenue[32 * 64 + 32] = 8;
  liveSnapshot.avenue[33 * 64 + 32] = 2;
  liveSnapshot.rev += 1;
  renderer.render(liveSnapshot);
  test.assert(renderer.debugStats().chunkBuildCount === beforeAvenue + 1, "an avenue-only change repaints its one infrastructure chunk");
}
{
  // The scenery list (buildings, trees, parks, blazes) is built once per
  // content revision: panning redraws the layer from it, a city change
  // rebuilds it.
  const builds = renderer.debugStats().derivedBuilds;
  const draws = renderer.debugStats().buildingsDraws;
  renderer.panByScreen(30, 12);
  renderer.panByScreen(-8, 40);
  test.assert(renderer.debugStats().derivedBuilds === builds && renderer.debugStats().buildingsDraws === draws + 2,
    "panning redraws the buildings layer without rebuilding or re-sorting the scenery list");
  const rasterBuilds = renderer.debugStats().sceneryRasterBuilds;
  renderer.panByScreen(1, 1);
  test.assert(renderer.debugStats().sceneryRasterBuilds === rasterBuilds,
    "nearby camera moves reuse the painter-ordered overscan raster");
  renderer.panByScreen(400, 0);
  test.assert(renderer.debugStats().sceneryRasterBuilds === rasterBuilds + 1,
    "leaving the overscan margin repaints scenery instead of exposing an empty edge");
  const beforeDeferred = renderer.debugStats();
  renderer.panByScreen(7, -3, { defer: true });
  renderer.panByScreen(5, 2, { defer: true });
  test.assert(renderer.debugStats().buildingsDraws === beforeDeferred.buildingsDraws,
    "coalesced camera input does not synchronously draw either intermediate view");
  test.assert(renderer.debugStats().view.panX === beforeDeferred.view.panX + 12,
    "deferred input still accumulates every camera delta immediately");
  renderer.render(liveSnapshot);
  test.assert(renderer.debugStats().buildingsDraws === beforeDeferred.buildingsDraws + 1,
    "one scheduled render draws the accumulated camera position");
  liveSnapshot.tree[20 * 64 + 20] = liveSnapshot.tree[20 * 64 + 20] ? 0 : 1;
  liveSnapshot.rev += 1;
  renderer.render(liveSnapshot);
  test.assert(renderer.debugStats().derivedBuilds === builds + 1, "a new content revision rebuilds the scenery list once");
  liveSnapshot.catalogId[21 * 64 + 21] = 0xd3;
  liveSnapshot.rev += 1;
  renderer.render(liveSnapshot);
  test.assert(renderer.debugStats().derivedBuilds === builds + 2, "an imported catalog tile change rebuilds the scenery that draws it");
  const zoomBefore = renderer.debugStats().view.zoom;
  const zoomed = renderer.zoomBy(1.1);
  test.assert(zoomed === math.stepZoom(zoomBefore, 1), "a small wheel factor still moves exactly one zoom step");
  renderer.zoomBy(0.9);
}

renderer.setPreview({ accepted: false, footprint: [{ x: 2, y: 2 }, { x: 3, y: 2 }] });
renderer.clearPreview();
test.assert(renderer.rotateBy(1) === 1, "rotateBy applies an exact clockwise quarter turn");
await Promise.resolve();
await Promise.resolve();
// A building whose street lies behind it draws from the opposite atlas, so
// besides the active direction the renderer may fetch the opposite of a
// direction it has shown — never a sideways one it has no use for.
{
  const paths = atlasPaths();
  const allowed = new Set(["/assets/bonsai/atlas-north.png", "/assets/bonsai/atlas-south.png", "/assets/bonsai/atlas-east.png", "/assets/bonsai/atlas-west.png"]);
  test.assert(paths.includes("/assets/bonsai/atlas-east.png") && new Set(paths).size === paths.length && paths.every((path) => allowed.has(path))
    && paths.length <= 4, "rotation lazily decodes the newly active direction, each atlas at most once");
}
test.assert(renderer.rotateBy(-1) === 0, "rotateBy applies an exact reversible counterclockwise quarter turn");
test.assert(renderer.zoomBy(100) === math.MAX_ZOOM && renderer.zoomBy(0.0001) === math.MIN_ZOOM, "zoomBy clamps at the pure camera limits");
// Rotation re-centres the pan on the ground at the middle of the view, so
// measure the pan change rather than assuming it started at zero.
const panBefore = renderer.debugStats().view;
const panAfter = renderer.panByScreen(12, -8);
test.assert(panAfter.x === panBefore.panX + 12 && panAfter.y === panBefore.panY - 8, "pan is retained as view-only screen state");
const persistedView = renderer.debugStats().view;
test.assert(Object.isFrozen(persistedView) && persistedView.panX === panAfter.x && persistedView.panY === panAfter.y, "debug stats expose a detached frozen camera view for Working Session persistence");
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

// Avenues (the Basin avenue layer): each half paints its cross-section from
// the median out — hedge, red BRT lane, general lanes, green slow lane,
// sidewalk, verge — and the same point of the tile keeps its paint under
// every quarter turn. Side streets open a mouth and a crossing; an avenue
// with nothing beyond ends at a kerb; a deck has a parapet; a half its
// partner does not answer is an ordinary street.
{
  const n = 16;
  const avenueSnapshot = { size: n, tick: 0, seed: 1, rev: 1, timeOfDay: 0.5, alt: new Uint8Array(n * n), water: new Uint8Array(n * n), road: new Uint8Array(n * n), avenue: new Uint8Array(n * n) };
  for (let x = 2; x <= 10; x += 1) for (const y of [7, 8]) avenueSnapshot.road[y * n + x] = 1;
  for (let x = 3; x <= 10; x += 1) { avenueSnapshot.avenue[7 * n + x] = 8; avenueSnapshot.avenue[8 * n + x] = 2; }
  avenueSnapshot.road[6 * n + 6] = 1; avenueSnapshot.road[5 * n + 6] = 1;
  avenueSnapshot.water[8 * n + 9] = 1;
  avenueSnapshot.road[12 * n + 12] = 1; avenueSnapshot.avenue[12 * n + 12] = 8;
  const LEFT = { 1: [-1, 0], 2: [0, -1], 4: [1, 0], 8: [0, 1] };
  const AHEAD = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] };
  // The pixel under a point `a` metres out from the median, `s` along.
  const paintAt = (tile, rotation, a, s) => {
    const L = LEFT[tile.dir], F = AHEAD[tile.dir];
    const u = L[0] * (0.5 - a / 16) + F[0] * s, v = L[1] * (0.5 - a / 16) + F[1] * s;
    const [ru, rv] = [[u, v], [-v, u], [-u, -v], [v, -u]][rotation];
    const px = Math.floor((ru - rv) * (math.TILE_W / 2) + tile.anchorX), py = Math.floor((ru + rv) * (math.TILE_H / 2) + tile.anchorY);
    const k = (py * tile.width + px) * 4;
    return [tile.pixels[k], tile.pixels[k + 1], tile.pixels[k + 2]].join(",");
  };
  const is = (tile, rotation, a, s, part) => paintAt(tile, rotation, a, s) === tile.paint[part].join(",");
  let turns = true;
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const north = renderer.avenueTile(avenueSnapshot, 4, 7);
    const south = renderer.avenueTile(avenueSnapshot, 4, 8);
    turns &&= north.dir === 8 && south.dir === 2 && north.ahead === 2 && north.behind === 2 && !north.outer && !north.crossing
      && is(north, rotation, 0.3, 0.1, "hedge") && is(north, rotation, 3.2, 0.1, "brt") && is(north, rotation, 7, 0.1, "asphalt")
      && is(north, rotation, 12.4, 0.1, "slow") && is(north, rotation, 14.2, 0.1, "walk") && is(north, rotation, 15.6, 0.1, "verge")
      && is(south, rotation, 3.2, -0.2, "brt") && is(south, rotation, 12.4, -0.2, "slow");
    renderer.rotateBy(1);
  }
  test.assert(turns, "both halves paint median, red BRT lane, lanes, slow lane, sidewalk and verge outward from the centre, under all four quarter turns");
  const mouth = renderer.avenueTile(avenueSnapshot, 6, 7);
  const across = renderer.avenueTile(avenueSnapshot, 6, 8);
  test.assert(mouth.outer && mouth.crossing && is(mouth, 0, 13.15, 0.1, "asphalt") && is(mouth, 0, 0.3, 0.1, "asphalt"),
    "a side street opens the kerb into a mouth and the median into a crossing");
  test.assert(!across.outer && across.crossing && is(across, 0, 0.3, 0.1, "asphalt") && is(across, 0, 14.2, 0.1, "walk"),
    "across the avenue the median opens too, and the far kerb stays");
  const end = renderer.avenueTile(avenueSnapshot, 10, 7);
  const onward = renderer.avenueTile(avenueSnapshot, 3, 7);
  test.assert(end.behind === 0 && is(end, 0, 8, -0.35, "walk") && is(end, 0, 8, -0.46, "verge") && is(end, 0, 0.3, -0.25, "asphalt"),
    "with nothing beyond, the avenue ends at a kerb and the median stops short of it");
  test.assert(onward.ahead === 1 && is(onward, 0, 8, 0.45, "asphalt"), "into another street the carriageway runs to the edge");
  const deck = renderer.avenueTile(avenueSnapshot, 9, 8);
  test.assert(deck.bridge && is(deck, 0, 15.2, 0.1, "parapet"), "on a bridge the verge is a parapet");
  test.assert(renderer.avenueTile(avenueSnapshot, 12, 12) === null && renderer.avenueTile(avenueSnapshot, 2, 7) === null,
    "a half its partner does not answer, and a plain street, are not avenue tiles");
}

// An avenue is one surface. Its halves may stand a level apart on a hill and
// its land tiles meet a deck at the higher bank, yet each grid vertex an
// avenue touches has one height for every half meeting there: the median
// edge the halves share, the edge between one tile of a run and the next,
// and the seam where the land meets the deck. Each half's pieces are planes
// through its corners, so equal corners mean the median, the BRT lanes and
// the lane lines run on without a break.
{
  const n = 16;
  const hill = { size: n, tick: 0, seed: 1, rev: 1, timeOfDay: 0.5, alt: new Uint8Array(n * n), slope: new Uint8Array(n * n).fill(1), water: new Uint8Array(n * n), road: new Uint8Array(n * n), avenue: new Uint8Array(n * n) };
  const pairs = [[7, 8], [12, 13]];
  for (const [north, south] of pairs) for (let x = 2; x <= 12; x += 1) {
    hill.road[north * n + x] = 1; hill.road[south * n + x] = 1;
    hill.avenue[north * n + x] = 8; hill.avenue[south * n + x] = 2;
  }
  // Rows 7/8 climb a level, the south half a tile before the north one.
  for (let x = 0; x < n; x += 1) { hill.alt[7 * n + x] = x >= 6 ? 1 : 0; hill.alt[8 * n + x] = x >= 5 ? 1 : 0; }
  // Rows 12/13 cross a river from a bank at level 1 to one at level 2.
  for (let x = 0; x < n; x += 1) for (const y of [12, 13]) {
    if (x === 7 || x === 8) hill.water[y * n + x] = 1;
    else hill.alt[y * n + x] = x <= 6 ? 1 : 2;
  }
  const corner = (x, y) => renderer.avenueTile(hill, x, y).worldCorners;
  let shared = true;
  for (const [north, south] of pairs) for (let x = 2; x <= 12; x += 1) {
    const [, , nSE, nSW] = corner(x, north);
    const [sNW, sNE] = corner(x, south);
    shared &&= nSW === sNW && nSE === sNE;
    if (x < 12) for (const y of [north, south]) {
      const here = corner(x, y), next = corner(x + 1, y);
      shared &&= here[1] === next[0] && here[2] === next[3];
    }
  }
  test.assert(shared, "both halves share their median edge and every tile meets the next on one edge, on a hill and across a bridge");
  test.assert(corner(4, 7)[2] === 1 && corner(4, 8)[1] === 1,
    "where the south half climbs first, the north half's median corner rises with it instead of stepping");
  const deck = renderer.avenueTile(hill, 7, 12);
  const bank = renderer.avenueTile(hill, 6, 12);
  test.assert(deck.bridge && deck.base === 2 && bank.base === 1 && bank.worldCorners[1] === 2 && bank.worldCorners[2] === 2 && corner(6, 13)[1] === 2,
    "the last land tile before the deck rises to the deck's height at the seam");
  let turned = true;
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const tile = renderer.avenueTile(hill, 4, 7);
    turned &&= tile.corners.every((value, i) => value === tile.worldCorners[(i - rotation + 4) % 4] - tile.base);
    renderer.rotateBy(1);
  }
  test.assert(turned, "the shared corners turn with the camera onto the screen corners the surface is drawn from");
  // And in pixels: where the halves climb a tile apart (x 4 and 5), each
  // half's drawn tile puts its median on the ground the shared edge stands
  // on, all along the edge. Both halves place the edge at the same
  // screen height (the corners above), so the hedge runs on across them.
  let hedge = true;
  for (const x of [4, 5]) for (const y of [7, 8]) {
    const tile = renderer.avenueTile(hill, x, y);
    const [A, B, C, D] = tile.corners;
    // Points 0.4 m inside this half from the centre line, along its run.
    for (const along of [-0.35, -0.2, 0, 0.2, 0.35]) {
      const L = { 8: [0, 1], 2: [0, -1] }[tile.dir];
      const du = along, dv = L[1] * (0.5 - 0.4 / 16);
      const s = du + 0.5, t = dv + 0.5;
      const z = A * (1 - s) * (1 - t) + B * s * (1 - t) + C * s * t + D * (1 - s) * t;
      const px = Math.floor((du - dv) * (math.TILE_W / 2) + tile.laid.anchorX);
      const py = Math.floor((du + dv) * (math.TILE_H / 2) - z * math.HEIGHT_STEP + tile.laid.anchorY);
      const k = (py * tile.laid.width + px) * 4;
      // The hedge and the island's paving are each under a pixel wide at
      // this scale; either is the median.
      const got = [tile.laid.pixels[k], tile.laid.pixels[k + 1], tile.laid.pixels[k + 2]].join(",");
      hedge &&= got === tile.paint.hedge.join(",") || got === tile.paint.walk.join(",");
    }
  }
  test.assert(hedge && renderer.avenueTile(hill, 4, 7).laid.lift > 0, "each tilted half draws its median hedge on its shared edge, where the surface puts it");
}

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
  const end = canvasSource.indexOf("function loadAtlasImages(");
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
test.assertIncludes(canvasSource, 'const key = `${revision}:${state.camera.rotation}:${season}:${night ? "n" : "d"}`;', "the scenery list is keyed by content revision, rotation, season and night");
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
test.assertIncludes(canvasSource, 'if (layer === "terrain") {\n      hash = fnvUpdate(hash, MATH.seasonOf(snapshot));', "the terrain chunk signature carries the season");
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

// --- networks follow the ground, SC2K-style ---------------------------------------
{
  // Chunks are drawn on canvases the renderer creates; keep them to read
  // what was drawn on them.
  const created = [];
  const createElement = document.createElement;
  document.createElement = (name) => { const canvas = createElement(name); created.push(canvas); return canvas; };
  await renderer.mount(stack);
  await Promise.resolve(); await Promise.resolve();
  const n = 8;
  const base = () => ({
    size: n, tick: 12, seed: 5, rev: 1, timeOfDay: 0.5,
    alt: new Uint8Array(n * n).fill(1), water: new Uint8Array(n * n), slope: new Uint8Array(n * n),
    road: new Uint8Array(n * n), rail: new Uint8Array(n * n), wire: new Uint8Array(n * n), pipe: new Uint8Array(n * n),
    highway: new Uint8Array(n * n), onramp: new Uint8Array(n * n), zone: new Uint8Array(n * n),
  });
  const drawn = (snapshot, display = {}) => {
    renderer.resetView({ center: { x: 4, y: 4 }, size: n, zoom: math.DEFAULT_ZOOM });
    // A quarter turn and back empties the chunk cache: every chunk redraws.
    renderer.rotateBy(1); renderer.rotateBy(-1);
    created.length = 0;
    snapshot.rev = (snapshot.rev || 0) + Math.floor(Math.random() * 1e6);
    renderer.render(snapshot, { display: { buildings: true, infrastructure: true, zones: false, underground: false, ...display } });
    return created.flatMap((canvas) => canvas._context.calls);
  };
  const count = (calls, name) => calls.filter((call) => call[0] === name).length;

  // A road up a hillside: the tile below the step is a slope tile.
  const hill = base();
  for (let y = 0; y < n; y += 1) for (let x = 4; x < n; x += 1) hill.alt[y * n + x] = 2;
  for (let y = 0; y < n; y += 1) hill.slope[y * n + 3] = 1;
  for (let x = 1; x < 7; x += 1) hill.road[3 * n + x] = 1;
  const sloped = drawn(hill);
  const tilted = sloped.filter((call) => call[0] === "transform" && Math.abs(call[2]) > 1e-9);
  test.assert(count(sloped, "clip") >= 4 && tilted.length >= 2,
    `a road on a slope tile is laid on the tilted ground in four quadrants (${count(sloped, "clip")} clips, ${tilted.length} tilted quadrants)`);
  const flat = base();
  for (let x = 1; x < 7; x += 1) flat.road[3 * n + x] = 1;
  test.assert(count(drawn(flat), "clip") === count(drawn(base()), "clip"), "a road on level ground is drawn flat, as before");

  // A power line that shares its tile with a street stands its pole on the
  // kerb, not in the middle of the carriageway. Which atlas frame a tile drew
  // is only visible in the source rectangle, which is why the fake context
  // keeps one.
  {
    const frameRect = (name) => {
      const frame = canvasContext.window.AISystem6BonsaiAtlas.frames[name];
      return frame ? [frame.x, frame.y, frame.w, frame.h] : null;
    };
    const sourceRectsOf = (snapshot) => { drawn(snapshot); return created.flatMap((canvas) => canvas._context.sourceRects); };
    const same = (list, rect) => list.some((entry) => rect && entry.every((value, k) => value === rect[k]));
    const alongStreet = base();
    for (let x = 2; x < 6; x += 1) { alongStreet.road[4 * n + x] = 1; alongStreet.wire[4 * n + x] = 1; }
    const streetRects = sourceRectsOf(alongStreet);
    test.assert(same(streetRects, frameRect("wire.side.mask-10")) && !same(streetRects, frameRect("wire.mask-10")),
      "a power line along a street draws the kerbside frames, never the pole-in-the-road one");
    const acrossField = base();
    for (let x = 2; x < 6; x += 1) acrossField.wire[4 * n + x] = 1;
    const fieldRects = sourceRectsOf(acrossField);
    test.assert(same(fieldRects, frameRect("wire.mask-10")) && !same(fieldRects, frameRect("wire.side.mask-10")),
      "a power line across open ground still stands its pole on the tile centre");
    const acrossRail = base();
    for (let x = 2; x < 6; x += 1) { acrossRail.rail[4 * n + x] = 1; acrossRail.wire[4 * n + x] = 1; }
    test.assert(same(sourceRectsOf(acrossRail), frameRect("wire.side.mask-10")),
      "and beside a railway it keeps to the kerb too");
  }

  // Water pipes are buried: the daylight map does not draw them.
  const piped = base();
  for (let x = 1; x < 7; x += 1) piped.pipe[3 * n + x] = 1;
  const daylightPipes = count(drawn(piped), "drawImage");
  const daylightNothing = count(drawn(base()), "drawImage");
  const undergroundPipes = count(drawn(piped, { underground: true }), "drawImage");
  test.assert(daylightPipes === daylightNothing && undergroundPipes > count(drawn(base(), { underground: true }), "drawImage"),
    `pipes show on the underground view only (daylight ${daylightPipes} = ${daylightNothing} draws; underground ${undergroundPipes})`);

  // Highways stand on piers with the buildings, so they sort with them.
  const buildingsLayer = stack.children.find((canvas) => canvas.dataset.bonsaiLayer === "buildings")._context;
  const road = base();
  for (let x = 0; x < n; x += 1) road.road[5 * n + x] = 1;
  buildingsLayer.calls.length = 0;
  drawn(road);
  const sceneryCalls = () => buildingsLayer.images.at(-1)?._context?.calls || [];
  const withoutHighway = count(sceneryCalls(), "drawImage");
  const raised = base();
  for (let x = 0; x < n; x += 1) { raised.road[5 * n + x] = 1; raised.highway[2 * n + x] = 1; raised.highway[3 * n + x] = 1; }
  buildingsLayer.calls.length = 0;
  drawn(raised);
  test.assert(count(sceneryCalls(), "drawImage") >= withoutHighway + 2 * n,
    "a highway deck is drawn on the buildings layer, raised above the streets it crosses");

  // A building faces its street: on an east or west street its sprite is
  // mirrored, on a north or south street it is drawn as composed.
  const facing = (roadAt) => {
    const snapshot = base();
    roadAt(snapshot);
    snapshot.buildings = [{ x: 3, y: 3, w: 1, h: 1, footprint: { w: 1, h: 1 }, zone: 2, stage: 1, variant: 4, state: 3 }];
    // A blank draw first, so nothing of the previous case is still pending.
    drawn(base());
    buildingsLayer.calls.length = 0;
    drawn(snapshot);
    return sceneryCalls().filter((call) => call[0] === "scale" && call[1] === -1).length;
  };
  const eastStreet = facing((snapshot) => { for (let y = 0; y < n; y += 1) snapshot.road[y * n + 4] = 1; });
  const southStreet = facing((snapshot) => { for (let x = 0; x < n; x += 1) snapshot.road[4 * n + x] = 1; });
  test.assert(eastStreet === 1 && southStreet === 0,
    `a building on an east street is mirrored toward it, one on a south street is not (${eastStreet}, ${southStreet} mirrored draws)`);
  // The anchor is below the viewport, but a 3x3 downtown tower still reaches
  // into it at zoom 2. Culling must follow its sprite, not a 60px anchor margin.
  const tower = base();
  tower.buildings = [{ x: 3, y: 3, w: 3, h: 3, footprint: { w: 3, h: 3 }, zone: 2, stage: 3, variant: 24, state: 3 }];
  const height = renderer.debugStats().cssHeight;
  const panY = height / 2 + 300 - 32 + 20;
  renderer.render(tower, { zoom: 2, rotation: 0, panX: 0, panY });
  test.assert(count(sceneryCalls(), "drawImage") > 0, "a tower whose anchor is below the viewport retains its visible upper floors");
  sceneryCalls().length = 0;
  renderer.render(tower, { panY: panY + 10000 });
  test.assert(count(sceneryCalls(), "drawImage") === 0, "a fully offscreen tower is still culled");
  document.createElement = createElement;
  renderer.dispose();
}

test.finish();
