// Bonsai City voxel backend contracts: the three.js renderer is the second
// production backend behind the same surface as the Canvas 2D renderer. It
// reads render snapshots defensively, lazy-loads its bundled vendor, keeps
// every animated value a pure function of the snapshot, and proves its
// resource bookkeeping without WebGL.

import vm from "node:vm";
import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("bonsai-voxel");
const voxelSource = read("app/features/bonsai-renderer-voxel.js");

// --- static contracts ---------------------------------------------------------

test.assertFile("app/features/bonsai-renderer-voxel.js", "the voxel renderer module exists");
test.assertFile("tooling/build-bonsai-renderer-vendor.mjs", "the vendor build script exists");
test.assertFile("tooling/vendor/bonsai-renderer-entry.mjs", "the vendor entry exists");

test.assertIncludes(voxelSource, "AISystem6BonsaiVoxelRendererLoaded", "the module installs its lazy-loader flag");
test.assertIncludes(voxelSource, "/app/vendor/bonsai-renderer.js?v=", "the vendor URL carries a version tag");
test.assertIncludes(voxelSource, "import(", "the renderer lazy-loads its three.js vendor");
test.assertNotIncludes(voxelSource, "Math.random", "view variation never falls back to Math.random");
test.assertNotIncludes(voxelSource, "Date.now", "the renderer never reads the wall clock");
test.assert((voxelSource.match(/performance\.now/g) || []).length <= 3 && voxelSource.includes("frameStart") && voxelSource.includes("shadowReduced"),
  "the only performance clock in the renderer feeds the first-30-frame budget probe");
test.assertNotIncludes(voxelSource, "setInterval", "the renderer never starts its own timer loop");
test.assertNotIncludes(voxelSource, "advanceTicks", "the renderer never advances the simulation");
test.assertNotIncludes(voxelSource, "submitCommand", "the renderer never emits simulation commands");

const entrySource = read("tooling/vendor/bonsai-renderer-entry.mjs");
test.assertIncludes(entrySource, 'from "three"', "the vendor entry re-exports from three");
test.assert(!/from\s+"(?!three")/.test(entrySource), "the vendor entry pulls from three only");
test.assertIncludes(entrySource, "CanvasTexture", "the vendor entry carries CanvasTexture for the texture atlas");
test.assertIncludes(entrySource, "NearestFilter", "the vendor entry carries nearest magnification for the pixel look");
test.assertIncludes(entrySource, "NearestMipmapLinearFilter", "the vendor entry carries mipmapped minification for mobile GPUs");

// Micro-voxel textures: the renderer loads a 512px power-of-two manifest,
// groups opaque blocks by material id into per-tile instanced meshes with
// per-face UV geometry, and keeps the Minecraft-style pixels crisp on Retina
// via nearest magnification while mipmaps keep zoomed-out mobile cheap. The
// DPR is capped at 2 so phone GPUs never render at 3x.
test.assertIncludes(voxelSource, "textures.json", "the renderer loads the texture manifest");
test.assertIncludes(voxelSource, "new THREE.CanvasTexture", "the renderer builds a three texture from the atlas image");
test.assertIncludes(voxelSource, "NearestMipmapLinearFilter", "the texture mipmaps for mobile");
test.assertIncludes(voxelSource, "buildChunkMeshes", "opaque blocks group by texture material");
test.assertIncludes(voxelSource, "function tileGeometry", "each material owns per-face UV geometry");
test.assertIncludes(voxelSource, "Math.min(2, value)", "the renderer caps the pixel ratio at 2 for Retina/mobile");

// Continuous paths: roads, rails, pipes, wires, highways, bridges, and road
// tunnels draw direction-aware strips that continue across tile edges and
// turn corners, plus bridge guards and tunnel portals.
test.assertIncludes(voxelSource, "function networkMask", "path decorations read neighbour connectivity");
test.assertIncludes(voxelSource, "pushPathStrip", "center strips continue along each connected arm");
test.assertIncludes(voxelSource, "pushTwinRails", "rails draw as twin continuous strips");
test.assertIncludes(voxelSource, "pushBridgeGuards", "bridges over water carry guard rails");
test.assertIncludes(voxelSource, "pushTunnelPortals", "road bores get portal frames at their open ends");
test.assertIncludes(voxelSource, '"tunnel"', "tunnel tiles use the dark bore material");

// Building readability: per-zone wall textures with day/night windows, roof
// tiles, per-variant roof decorations, and a front door on small houses.
test.assertIncludes(voxelSource, "wall.${prefix}.night", "buildings swap to lit-window walls at night");
test.assertIncludes(voxelSource, '"roof.dark"', "night roofs dim with the walls");
test.assertIncludes(voxelSource, "decorSeed", "per-variant roof decorations distinguish buildings");
test.assertIncludes(voxelSource, "stepped gabled roof", "stage-1 houses read as houses");
test.assertIncludes(voxelSource, "setback tower", "stage-3 buildings read as high-rises");
test.assertIncludes(voxelSource, "pushCatalogObject", "civic landmarks own voxel silhouettes");
test.assertIncludes(voxelSource, "arcology", "landmarks include domes");
test.assertIncludes(voxelSource, "waterTexture.offset", "water shimmers from the snapshot clock");
test.assertIncludes(voxelSource, "Beach ring", "coastlines gain a sand lip");
test.assertIncludes(voxelSource, "pushRoadCurbs", "roads carry continuous curbs");
test.assertIncludes(voxelSource, "cabin block on top", "cars are two-tone with a cabin");
test.assertIncludes(voxelSource, "Waterfalls: white falling curtains", "the voxel world renders waterfall curtains");
test.assertIncludes(voxelSource, "Active tornado and monster disasters", "the voxel world renders active disasters");
test.assertIncludes(voxelSource, '"zone.airport"', "airport zones render a runway ground slab");
test.assertIncludes(voxelSource, '"zone.seaport"', "seaport zones render a dock ground slab");
test.assertIncludes(voxelSource, '"zone.military"', "military zones render an installation ground slab");
test.assertIncludes(voxelSource, "Cliff shadow bands", "lower land tiles carry dark edges toward higher ground");
test.assertIncludes(voxelSource, "A red torii at the water's edge", "piers and marinas carry a water-edge torii");
test.assertIncludes(voxelSource, "in winter the whole lowland snows over", "high grass and slopes wear snow in winter");
test.assertIncludes(voxelSource, "winter freezes to a pale ice", "winter water freezes to pale ice");
test.assertIncludes(voxelSource, "Spring sakura petals", "spring drifts sakura petals from blossom trees");
test.assertIncludes(voxelSource, "A real ramp: a wide highway-end slab", "voxel onramps taper from wide highway to narrow road");
test.assertIncludes(voxelSource, "The four-season canopy", "the voxel world cycles sakura, green, maple, and winter crowns");
test.assertIncludes(voxelSource, "Airport control tower", "airport zones gain control towers");
test.assertIncludes(voxelSource, "Dock crane", "seaport zones gain dock cranes");
test.assertIncludes(voxelSource, "sakura in spring", "spring scatters sakura crowns");
test.assertIncludes(voxelSource, "in winter the whole lowland snows over", "winter snows over the lowland");
test.assertIncludes(voxelSource, "Math.floor(((Number(snapshot.tick) || 0) % 1500) / 375)", "the chunk signature carries the season");
test.assertIncludes(voxelSource, "facility.${facility.kind}", "facilities resolve their own texture tile");

// --- the module runs headless and installs a frozen surface -------------------

const context = vm.createContext({ window: {} });
vm.runInContext(voxelSource, context);
const voxel = context.window.AISystem6BonsaiVoxelRenderer;

test.assert(context.window.AISystem6BonsaiVoxelRendererLoaded === true, "the loaded flag is set for the lazy loader");
test.assert(voxel && Object.isFrozen(voxel), "the public surface is frozen");
test.assert(voxel.BACKEND === "three-voxel", "the backend names itself three-voxel");
test.assert(voxel.CHUNK_SIZE === 16, "static geometry chunks in 16x16 tiles like the Canvas backend");
test.assert(typeof voxel.WEBGL_UNAVAILABLE_CODE === "string" && voxel.WEBGL_UNAVAILABLE_CODE.length > 0, "the WebGL fallback error code is published");

// Method-for-method parity with AISystem6BonsaiCanvasRenderer, so the shell
// swaps backends with one factory change.
const sharedSurface = [
  "mount", "isReady", "resize", "render", "pickTile", "setPreview", "clearPreview",
  "renderMiniMap", "rotateBy", "zoomBy", "panByScreen", "resetView", "dispose", "debugStats",
];
sharedSurface.forEach((name) => {
  test.assert(typeof voxel[name] === "function", `the surface carries ${name}()`);
});
if (exists("app/features/bonsai-renderer-canvas.js")) {
  const canvasSource = read("app/features/bonsai-renderer-canvas.js");
  sharedSurface.forEach((name) => {
    test.assertIncludes(canvasSource, `${name},`, `the Canvas backend also exports ${name}`);
  });
}

test.assert(voxel.dispose() === undefined && voxel.debugStats().disposed === true, "dispose before mount is a safe no-op that reports disposed");
test.assert(voxel.debugStats().activeRaf === 0, "no animation frame survives outside render scheduling");
test.assert(voxel.pickTile(10, 10, { left: 0, top: 0, width: 100, height: 100 }) === null, "picking before mount returns null");

const pure = voxel.pure;
test.assert(pure && Object.isFrozen(pure), "the pure toolkit is frozen");

// --- tile scale: both backends report the same frame readout ----------------
test.assert(typeof pure.measureFrame === "function", "the voxel backend exposes the tile-scale readout");
if (exists("app/features/bonsai-renderer.js")) {
  const sharedSource = read("app/features/bonsai-renderer.js");
  test.assertIncludes(sharedSource, "function measureFrame", "the Canvas projection module exposes the same readout");
  const sharedContext = vm.createContext({ window: {}, console });
  vm.runInContext(sharedSource, sharedContext);
  const shared = sharedContext.window.AISystem6BonsaiRenderer;
  const voxelFrame = pure.measureFrame();
  const canvasFrame = shared.measureFrame();
  test.assert(Math.abs(voxelFrame.tilesAcross - canvasFrame.tilesAcross) < 1e-9 && Math.abs(voxelFrame.tilesDown - canvasFrame.tilesDown) < 1e-9,
    `both backends count the same tiles in a 1024x640 frame (${voxelFrame.tilesAcross.toFixed(2)} x ${voxelFrame.tilesDown.toFixed(2)})`);
  test.assert(Math.abs(voxelFrame.tilesAcross - 1024 / (64 * 0.7)) < 1e-9, "tiles across = viewport width over the diamond width at zoom 1");
  test.assert(Math.abs(voxelFrame.tilesDown - 640 / (32 * 0.7)) < 1e-9, "tiles down = viewport height over the diamond-row advance at zoom 1");
}

// --- view math parity: project and pick agree on every rotation ---------------

test.assert(pure.clampZoom(99) === 2.5 && pure.clampZoom(0.01) === 0.4 && pure.DEFAULT_ZOOM === 0.7, "zoom clamps to the Canvas backend range");
test.assert(pure.normalizeRotation(-1) === 3 && pure.normalizeRotation(5) === 1, "rotation normalizes to four quarter-turns");

for (let rotation = 0; rotation < 4; rotation += 1) {
  const view = { zoom: 1.35, rotation, panX: 40, panY: -25 };
  for (const [x, y] of [[3, 4], [12, 7], [0, 0], [63, 63]]) {
    const point = pure.projectPoint(view, 64, 800, 600, x + 0.5, 0, y + 0.5);
    const tile = pure.tileFromScreen(view, 64, 800, 600, point.sx, point.sy, 0);
    test.assert(tile.x === x && tile.y === y, `rotation ${rotation} round-trips tile (${x}, ${y})`);
  }
}

{
  const view = { zoom: 0.82, rotation: 1, panX: 0, panY: 0 };
  const altitude = 9;
  const point = pure.projectPoint(view, 64, 640, 480, 20.5, altitude * pure.ALT_STEP, 30.5);
  const tile = pure.tileFromScreen(view, 64, 640, 480, point.sx, point.sy, altitude);
  test.assert(tile.x === 20 && tile.y === 30, "altitude-aware picking round-trips a lifted tile");
}

{
  const flat = { zoom: 1, rotation: 2, panX: 0, panY: 0 };
  const panned = { zoom: 1, rotation: 2, panX: 17, panY: -9 };
  const before = pure.projectPoint(flat, 64, 800, 600, 10.5, 0, 10.5);
  const after = pure.projectPoint(panned, 64, 800, 600, 10.5, 0, 10.5);
  test.assert(
    Math.abs(after.sx - before.sx - 17) < 1e-9 && Math.abs(after.sy - before.sy + 9) < 1e-9,
    "panByScreen units are exact screen pixels, matching the Canvas backend"
  );
}

{
  const view = { zoom: 1.2, rotation: 3, panX: 0, panY: 0 };
  const pan = pure.panToCenter({ x: 12, y: 40 }, 64, view, 800, 600);
  const centered = { ...view, panX: pan.panX, panY: pan.panY };
  const point = pure.projectPoint(centered, 64, 800, 600, 12.5, 0, 40.5);
  test.assert(
    Math.abs(point.sx - 400) < 1e-6 && Math.abs(point.sy - 300) < 1e-6,
    "resetView centering puts the requested tile at the viewport middle"
  );
}

// --- recipes from the declarative atlas source --------------------------------

const fallbackRecipes = pure.buildRecipes(null);
test.assert(
  ["r", "c", "i"].every((prefix) => fallbackRecipes.families[prefix]),
  "the fallback recipe carries all three building families"
);
test.assert(
  fallbackRecipes.stages[1].height < fallbackRecipes.stages[2].height
  && fallbackRecipes.stages[2].height < fallbackRecipes.stages[3].height,
  "stage heights grow through the three stages"
);
test.assert(fallbackRecipes.facilities.coal.footprint.w === 2, "the coal plant keeps its 2x2 recipe footprint");

if (exists("assets/bonsai/atlas-source.json")) {
  const source = JSON.parse(read("assets/bonsai/atlas-source.json"));
  const recipes = pure.buildRecipes(source);
  const grass = source.palette.grass;
  test.assert(
    Math.abs(recipes.terrain.grass.top.r - grass[0] / 255) < 1e-9,
    "recipe colors come from the atlas-source palette, not hardcoded art"
  );
  test.assert(
    Math.abs(recipes.stages[3].height - source.buildingStages[2].height / 64) < 1e-9,
    "stage 3 height converts atlas pixels to world units"
  );
}

// --- building grammar: the 2D composer's vocabulary as blocks -----------------

test.assert(Math.abs(pure.PX_PER_WORLD_Y - (64 / Math.SQRT2) * (Math.sqrt(3) / 2)) < 1e-9, "one world unit of height projects like the 2D pixel column at zoom 1");
test.assert(Math.abs(pure.pxToWorld(pure.PX_PER_WORLD_Y) - 1) < 1e-9, "pxToWorld inverts the projection scale");
test.assert(pure.tileCropFraction("wall.r.day#2/3") === 2 / 3 && pure.tileCropFraction("wall.r.day") === 1 && pure.tileCropFraction("x#9/3") === 1, "a cropped tile key parses to its storey fraction and rejects bad crops");
test.assert(pure.tileMaterialId("wall.c.day#1/3") === "wall.c.day", "a cropped tile key resolves to its material id");
test.assertIncludes(voxelSource, "function pushWallMass", "walls tile the texture once per world unit with a cropped top block");
test.assertIncludes(voxelSource, "function pushRoofClutter", "roof furniture comes from the grammar clutter list");
test.assertIncludes(voxelSource, "function pushGroundFloor", "ground floors read door, shopfront, and loading kinds");
test.assertIncludes(voxelSource, "function createWallMaterial", "wall blocks use the glass-mask material");
test.assertIncludes(voxelSource, "uGlassGlow", "night windows glow from a uniform");
test.assertIncludes(voxelSource, 'startsWith("wall.")', "only wall tiles route to the glass-mask material");

if (exists("assets/bonsai/atlas-source.json")) {
  const source = JSON.parse(read("assets/bonsai/atlas-source.json"));
  const expectedMasses = { single: 1, setback: 2, twin: 2, wing: 2, courtyard: 4, podium: 2, stepped: 3, gable: 2 };
  let checked = 0;
  Object.entries(source.buildingGrammar).forEach(([zone, byStage]) => {
    Object.entries(byStage).forEach(([stage, grammar]) => {
      const stageRecipe = source.buildingStages.find((entry) => String(entry.stage) === stage);
      const footprint = { w: stageRecipe.footprint[0], h: stageRecipe.footprint[1] };
      for (let variant = 1; variant <= 24; variant += 1) {
        const masses = pure.buildingMasses(footprint, stageRecipe.height, grammar, variant, variant * 2654435761);
        const form = grammar.massing[(variant - 1) % grammar.massing.length];
        const px = stageRecipe.height;
        const applies = (form === "setback" && px > 24) || (form === "twin" && footprint.w > 1.2) || form === "wing"
          || (form === "courtyard" && footprint.w > 1.2) || (form === "podium" && px > 30) || (form === "stepped" && px > 26) || form === "gable";
        const expected = applies ? expectedMasses[form] : 1;
        test.assert(masses.length === expected, `${zone} stage ${stage} variant ${variant} composes ${expected} mass(es) for ${form}`);
        masses.forEach((mass) => {
          test.assert(mass.y1 > mass.y0 && mass.u1 > mass.u0 && mass.v1 > mass.v0, `${zone} stage ${stage} variant ${variant}: every mass has volume`);
          test.assert(mass.u0 >= -footprint.w / 2 && mass.u1 <= footprint.w / 2 && mass.v0 >= -footprint.h / 2 && mass.v1 <= footprint.h / 2 + 0.16, `${zone} stage ${stage} variant ${variant}: masses stay inside the footprint`);
        });
        checked += 1;
      }
    });
  });
  test.assert(checked === 9 * 24, "every zone, stage and variant was composed");
  const tallest = pure.buildingMasses({ w: 3, h: 3 }, 76, source.buildingGrammar.commercial["3"], 1, 7);
  // A 76px stage-3 tower must clear two storey units at the current
  // PX_PER_TILE normalization (the world height shrinks as the tile pitch
  // grows, so the bound is the same pxToWorld contract the masses use).
  const twoStoreys = 2 * (10 / ((64 / Math.SQRT2) * (Math.sqrt(3) / 2)));
  test.assert(Math.max(...tallest.map((mass) => mass.y1)) > twoStoreys, "a stage-3 tower is taller than two storey units");
}

// --- defensive snapshot reads against a v3-flavored fake ----------------------

function makeFakeSnapshot() {
  const size = 8;
  const tiles = size * size;
  const alt = new Uint8Array(tiles).fill(2);
  alt[9] = 31; // v3 altitude range: the ceiling comes from the data.
  const water = new Uint8Array(tiles);
  water[0] = 1;
  const waterLevel = new Uint8Array(tiles); // future v3 layer
  waterLevel[0] = 3;
  const salt = new Uint8Array(tiles); // future v3 layer
  salt[0] = 1;
  const road = new Uint8Array(tiles);
  road[10] = 1;
  const rail = new Uint8Array(tiles);
  rail[11] = 1;
  const wire = new Uint8Array(tiles);
  wire[12] = 1;
  const pipe = new Uint8Array(tiles);
  pipe[13] = 1;
  const park = new Uint8Array(tiles);
  park[14] = 1;
  const tree = new Uint8Array(tiles);
  tree[15] = 1;
  const zone = new Uint8Array(tiles);
  const stage = new Uint8Array(tiles);
  const variant = new Uint8Array(tiles);
  const buildingState = new Uint8Array(tiles);
  zone[17] = 1; stage[17] = 2; variant[17] = 2; buildingState[17] = 3;
  zone[18] = 2; // zoned, empty: draws the tint slab
  const powered = new Uint8Array(tiles);
  powered[10] = 1;
  return {
    size, tick: 240, seed: 7, rev: 4, timeOfDay: 0.3,
    alt, water, waterLevel, salt, road, rail, wire, pipe, park, tree,
    zone, stage, variant, buildingState, powered,
    buildings: [{ x: 4, y: 4, zone: 3, stage: 3, variant: 1, state: 3, footprint: { w: 2, h: 2 } }],
    facilities: [{ x: 6, y: 1, kind: "coal" }],
    agents: {
      vehicles: [{ id: "vehicle-0", x: 2, y: 1, phase: 0.25 }],
      pedestrians: [{ id: "pedestrian-0", x: 1, y: 2, phase: 0.5 }],
      trains: [],
      smoke: [{ id: "smoke-0", x: 6, y: 1, phase: 0.4 }],
      serviceVehicles: [],
    },
  };
}

const snapshot = makeFakeSnapshot();
test.assert(pure.mapSize(snapshot) === 8, "map size comes from the snapshot, including non-default sizes");
test.assert(pure.mapSize({ alt: new Uint8Array(128 * 128) }) === 128, "a bare 128x128 layer still yields its size");
test.assert(pure.maxAltitude(snapshot) === 31, "the altitude ceiling is read from the data, not hardcoded");
test.assert(pure.terrainKindAt(snapshot, 0) === "water", "water reads defensively");
test.assert(pure.isRoad({ over: [1] }, 0) && pure.isRoad({ roads: [1] }, 0), "road reads accept both over codes and named layers");

const sceneObjects = pure.collectSceneObjects(snapshot, fallbackRecipes);
test.assert(sceneObjects.buildings.length === 2, "the buildings list and the stage grid merge without double counting");
test.assert(sceneObjects.covered.has("5:5"), "multi-tile footprints cover their tiles");
test.assert(sceneObjects.facilities[0].footprint.w === 2, "facility footprints fall back to the recipe");

const signatureA = pure.chunkSignature(snapshot, 0, 0, sceneObjects);
const signatureB = pure.chunkSignature(makeFakeSnapshot(), 0, 0, pure.collectSceneObjects(makeFakeSnapshot(), fallbackRecipes));
test.assert(signatureA === signatureB, "chunk signatures are deterministic");
const mutated = makeFakeSnapshot();
mutated.alt[9] = 5;
test.assert(
  pure.chunkSignature(mutated, 0, 0, pure.collectSceneObjects(mutated, fallbackRecipes)) !== signatureA,
  "editing a tile changes only that chunk's signature input"
);

const blocks = pure.collectChunkBlocks(snapshot, fallbackRecipes, 0, 0, sceneObjects);
test.assert(blocks.opaque.length > 0, "the chunk collector emits opaque voxel blocks");
test.assert(blocks.water.length === 1, "the water tile emits one translucent surface block");
test.assert(Math.abs(blocks.water[0].y - (3 * pure.ALT_STEP + 0.02)) < 1e-9, "a waterLevel layer lifts the water surface, which rides just above the bed top");
test.assert(blocks.tint.filter((block) => block.sx === 0.96 && block.sy === 0.024).length === 1, "an empty zoned tile emits one zone tint slab");
test.assert(blocks.tint.some((block) => block.sy === 0.02 && (block.sx === 1 || block.sz === 1)), "cliff shadows join the translucent tint pass");
const tallest = blocks.opaque.reduce((best, block) => (block.y > best.y ? block : best), blocks.opaque[0]);
test.assert(tallest.y > 31 * pure.ALT_STEP - 1, "the altitude-31 column stacks to its snapshot height");

const abandonedSnapshot = makeFakeSnapshot();
abandonedSnapshot.buildingState[17] = 5;
const abandonedBlocks = pure.collectChunkBlocks(
  abandonedSnapshot, fallbackRecipes, 0, 0, pure.collectSceneObjects(abandonedSnapshot, fallbackRecipes)
);
test.assert(
  JSON.stringify(abandonedBlocks.opaque) !== JSON.stringify(blocks.opaque),
  "building state changes the emitted blocks"
);

// --- catalog and blaze parity with the Canvas backend -------------------------

vm.runInContext(read("app/features/bonsai-catalog.js"), context);
test.assert(Boolean(context.window.AISystem6BonsaiCatalog), "the catalog module loads beside the renderer for these contracts");

const atlasRecipes = exists("assets/bonsai/atlas-source.json")
  ? pure.buildRecipes(JSON.parse(read("assets/bonsai/atlas-source.json")))
  : fallbackRecipes;
test.assert(
  atlasRecipes.catalog.city_hall && atlasRecipes.catalog.city_hall.footprint.w === 2,
  "catalog specials digest into recipes like facilities"
);
test.assert(
  Boolean(fallbackRecipes.catalogCategories.commercial) && fallbackRecipes.blaze.flood.a < 1,
  "category hues and blaze colors exist even without the atlas source"
);

const catalogSnapshot = makeFakeSnapshot();
catalogSnapshot.blaze = new Uint8Array(64);
catalogSnapshot.blaze[33] = 2; // young fire
catalogSnapshot.blaze[34] = 6; // flood
catalogSnapshot.catalogId = new Uint16Array(64);
catalogSnapshot.catalogId[40] = 226; // control tower: bespoke catalog recipe
catalogSnapshot.catalogId[41] = 150; // commercial catalog tile: category hue
catalogSnapshot.catalogId[10] = 226; // on a road tile: the road wins
catalogSnapshot.catalogId[17] = 226; // on a zoned tile: the zone building wins

const catalogObjects = pure.collectSceneObjects(catalogSnapshot, atlasRecipes);
test.assert(catalogObjects.blazeTiles.length === 2, "blaze tiles collect fire and flood");
test.assert(catalogObjects.catalogTiles.length === 2, "catalog tiles skip roads and zoned tiles");
test.assert(
  pure.chunkSignature(catalogSnapshot, 0, 0, catalogObjects) !== signatureA,
  "catalog and blaze layers dirty the chunk signature"
);

const catalogBlocks = pure.collectChunkBlocks(catalogSnapshot, atlasRecipes, 0, 0, catalogObjects);
const fireColor = atlasRecipes.blaze.fireYoung;
test.assert(
  catalogBlocks.opaque.some((block) => Math.abs(block.r - fireColor.r) < 1e-9 && Math.abs(block.b - fireColor.b) < 1e-9),
  "a young fire draws in the Canvas backend's flame color"
);
test.assert(catalogBlocks.water.length === 2, "the flood tile adds a translucent slab beside the sea tile");
const towerRecipe = atlasRecipes.catalog.control_tower;
test.assert(
  catalogBlocks.opaque.some((block) => Math.abs(block.sy - towerRecipe.height) < 1e-9 && Math.abs(block.r - towerRecipe.base.r) < 1e-9),
  "a catalog tile with a bespoke recipe draws that recipe"
);
const commercialTint = atlasRecipes.catalogCategories.commercial;
test.assert(
  catalogBlocks.opaque.some((block) => Math.abs(block.r - commercialTint.r) < 1e-9 && Math.abs(block.g - commercialTint.g) < 1e-9),
  "a catalog tile with no recipe falls back to its category hue"
);

const overlayBlocks = pure.collectOverlayBlocks(snapshot, "power");
test.assert(overlayBlocks.length === 63, "the power overlay tints every land tile and skips water");
test.assert(pure.collectOverlayBlocks(snapshot, "none").length === 0, "overlay none draws nothing");
const poweredBlock = overlayBlocks.find((block) => Math.floor(block.x) === 2 && Math.floor(block.z) === 1);
const unpoweredBlock = overlayBlocks.find((block) => Math.floor(block.x) === 3 && Math.floor(block.z) === 1);
test.assert(poweredBlock.g !== unpoweredBlock.g, "powered and unpowered tiles tint differently");

const agentSnapshot = makeFakeSnapshot();
agentSnapshot.tree = new Uint8Array(64); // no blossom trees, so no petals
const agentBlocks = pure.collectAgentBlocks(agentSnapshot, fallbackRecipes);
test.assert(agentBlocks.opaque.length === 3, "vehicle (body + cabin) and pedestrian facts become instances");
test.assert(agentBlocks.smoke.length === 1 && agentBlocks.smoke[0].a < 1, "smoke facts become translucent instances");
test.assert(pure.collectAgentBlocks({ size: 8 }, fallbackRecipes).opaque.length === 0, "a snapshot without agent facts renders no agents");

{
  const size = 8;
  const alt = new Uint8Array(size * size);
  const water = new Uint8Array(size * size);
  const terrainType = new Uint8Array(size * size);
  alt[2 * size + 3] = 4;
  water[3 * size + 3] = 1;
  const edges = pure.waterfallEdges({ size, alt, water, terrainType, tick: 0, timeOfDay: 0.5 });
  test.assert(edges.length === 1 && edges[0].dir === "n" && edges[0].height === 4, "pure waterfall derivation finds the high edge");
}

{
  const special = makeFakeSnapshot();
  special.zone = new Uint8Array(64);
  special.zone[0] = 5;
  special.stage = new Uint8Array(64);
  const blocks = pure.collectChunkBlocks(special, fallbackRecipes, 0, 0, pure.collectSceneObjects(special, fallbackRecipes));
  test.assert(blocks.opaque.some((block) => block.tile === "zone.airport"), "airport zones become runway ground slabs");
  test.assert(blocks.opaque.some((block) => block.sx === 0.1 && (block.tile === "concrete" || block.tile === "metal")),
    "airport zones place a deterministic control tower");
}

{
  const size = 8;
  const alt = new Uint8Array(size * size);
  const water = new Uint8Array(size * size);
  alt[2 * size + 3] = 4;
  const edges = pure.cliffEdges({ size, alt, water, tick: 0, timeOfDay: 0.5 });
  test.assert(edges.some((edge) => edge.x === 3 && edge.y === 3 && edge.dir === "n" && edge.drop === 4), "pure cliff derivation finds the high edge");
}

{
  const size = 8;
  const alt = new Uint8Array(size * size);
  const water = new Uint8Array(size * size);
  alt[0] = 26; // snow-line peak
  const blocks = pure.collectChunkBlocks({ size, alt, water, terrainType: new Uint8Array(size * size), tick: 0, timeOfDay: 0.5 }, fallbackRecipes, 0, 0, pure.collectSceneObjects({ size, alt, water }, fallbackRecipes));
  test.assert(blocks.opaque.some((block) => block.tile === "terrain.snow"), "peaks above the snow line wear the snow tile");
}

{
  const size = 8;
  const alt = new Uint8Array(size * size);
  const water = new Uint8Array(size * size);
  // Winter: tick 1125 = season 3, lowland grass snows over.
  const blocks = pure.collectChunkBlocks({ size, alt, water, terrainType: new Uint8Array(size * size), tick: 1125, timeOfDay: 0.5 }, fallbackRecipes, 0, 0, pure.collectSceneObjects({ size, alt, water }, fallbackRecipes));
  test.assert(blocks.opaque.some((block) => block.tile === "terrain.snow" && block.x > 0), "winter snows over the lowland grass");
}

{
  const size = 64;
  const tree = new Uint8Array(size * size);
  tree[0] = 1;
  tree[1] = 1;
  const blocks = pure.collectChunkBlocks({ size, alt: new Uint8Array(size * size), water: new Uint8Array(size * size), tree, tick: 0, timeOfDay: 0.5 }, fallbackRecipes, 0, 0, pure.collectSceneObjects({ size, alt: new Uint8Array(size * size), water: new Uint8Array(size * size), tree }, fallbackRecipes));
  test.assert(blocks.opaque.some((block) => block.tile === "tree.canopy" || block.tile === "tree.maple"),
    "tree tiles flow through the voxel collector as green or maple crowns");
}

const previewBlocks = pure.collectPreviewBlocks(
  { accepted: false, footprint: { x: 1, y: 1, w: 2, h: 2 } }, snapshot, fallbackRecipes
);
test.assert(previewBlocks.length === 4, "an area preview covers its footprint");
test.assert(previewBlocks[0].r > previewBlocks[0].g, "a rejected preview tints red");
test.assert(
  pure.collectPreviewBlocks({ x: 99, y: 99 }, snapshot, fallbackRecipes).length === 0,
  "out-of-bounds preview tiles are dropped"
);

// --- determinism of animated values -------------------------------------------

const lightA = pure.lightingFor(0.3);
const lightB = pure.lightingFor(0.3);
test.assert(JSON.stringify(lightA) === JSON.stringify(lightB), "lighting is a pure function of snapshot time");
test.assert(pure.lightingFor(0.5).dayFactor > pure.lightingFor(0.0).dayFactor, "noon is brighter than midnight");
test.assert(pure.waterBob(0.25) === pure.waterBob(0.25) && Math.abs(pure.waterBob(0.25)) < 0.1, "water animation is deterministic and small");

// --- dispose bookkeeping ------------------------------------------------------

const ledger = pure.createResourceLedger();
const resourceA = { name: "a" };
const resourceB = { name: "b" };
ledger.track(resourceA);
ledger.track(resourceB);
test.assert(ledger.count() === 2, "the ledger tracks created resources");
test.assert(ledger.release(resourceA) === true && ledger.count() === 1, "releasing removes one resource");
test.assert(ledger.release(resourceA) === false, "double release reports the miss");
let drained = 0;
ledger.drain(() => { drained += 1; });
test.assert(drained === 1 && ledger.count() === 0, "drain disposes every survivor and empties the ledger");
test.assertIncludes(voxelSource, "forceContextLoss", "dispose releases the WebGL context, not only the meshes");
test.assertIncludes(voxelSource, "cancelAnimationFrame", "dispose cancels the scheduled animation frame");
test.assertIncludes(voxelSource, "disconnect", "dispose disconnects the container observer");

// --- against the real simulation core, where this tree carries it -------------

if (exists("app/features/bonsai-city-sim.js")) {
  const simContext = vm.createContext({ window: {} });
  vm.runInContext(read("app/features/bonsai-city-sim.js"), simContext);
  const sim = simContext.window.AISystem6BonsaiSim;
  const city = sim.createCity({ seed: 42 });
  const realSnapshot = sim.buildRenderSnapshot(city);
  test.assert(pure.mapSize(realSnapshot) === city.size, "the real snapshot yields its own size");
  test.assert(realSnapshot.agents && Array.isArray(realSnapshot.agents.vehicles), "the real snapshot carries derived agent facts");
  const realObjects = pure.collectSceneObjects(realSnapshot, fallbackRecipes);
  const realBlocks = pure.collectChunkBlocks(realSnapshot, fallbackRecipes, 0, 0, realObjects);
  test.assert(realBlocks.opaque.length > 0, "a real city chunk produces voxel blocks");
}

test.finish();
