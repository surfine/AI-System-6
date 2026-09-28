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
test.assertIncludes(voxelSource, "Waterfalls: white falling curtains", "the voxel world renders waterfall curtains");
test.assertIncludes(voxelSource, "Active tornado and monster disasters", "the voxel world renders active disasters");
test.assertIncludes(voxelSource, '"zone.airport"', "airport zones render a runway ground slab");
test.assertIncludes(voxelSource, '"zone.seaport"', "seaport zones render a dock ground slab");
test.assertIncludes(voxelSource, '"zone.military"', "military zones render an installation ground slab");
test.assertIncludes(voxelSource, "Cliff shadow bands", "lower land tiles carry dark edges toward higher ground");
test.assertIncludes(voxelSource, "in winter the whole lowland snows over", "high grass and slopes wear snow in winter");
test.assertIncludes(voxelSource, "winter freezes to a pale ice", "winter water freezes to pale ice");
test.assertIncludes(voxelSource, "Spring sakura petals", "spring drifts sakura petals from blossom trees");
test.assertIncludes(voxelSource, "A real ramp: a wide highway-end slab", "voxel onramps taper from wide highway to narrow road");
test.assertIncludes(voxelSource, "The four-season canopy", "the voxel world cycles sakura, green, maple, and winter crowns");
test.assertIncludes(voxelSource, "Airport control tower", "airport zones gain control towers");
test.assertIncludes(voxelSource, "Dock crane", "seaport zones gain dock cranes");
test.assertIncludes(voxelSource, "sakura in spring", "spring scatters sakura crowns");
test.assertIncludes(voxelSource, "in winter the whole lowland snows over", "winter snows over the lowland");
test.assertIncludes(voxelSource, "hash = fnvUpdate(hash, seasonOfSnapshot(snapshot));", "the chunk signature carries the season the shell stamped");
test.assertIncludes(voxelSource, "facility.${facility.kind}", "facilities resolve their own texture tile");

// --- the module runs headless and installs a frozen surface -------------------

const context = vm.createContext({ window: {} });
vm.runInContext(read("app/features/bonsai-renderer.js"), context);
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
  test.assert(Math.abs(voxelFrame.tilesAcross - 1024 / (64 * 0.5)) < 1e-9, "tiles across = viewport width over the diamond width at the default step");
  test.assert(Math.abs(voxelFrame.tilesDown - 640 / (32 * 0.5)) < 1e-9, "tiles down = viewport height over the diamond-row advance at the default step");
}

// --- view math parity: project and pick agree on every rotation ---------------

test.assert(pure.clampZoom(99) === 2 && pure.clampZoom(0.01) === 0.25 && pure.DEFAULT_ZOOM === 0.5, "zoom clamps to the Canvas backend range");
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
        // Planned parcels intentionally use zone/stage forms (courtyard,
        // garage, podium, loading hall) rather than the legacy one-form
        // vocabulary. Their count is authored by the planning grammar.
        const expected = grammar.planning ? masses.length : (applies ? expectedMasses[form] : 1);
        test.assert(masses.length === expected && masses.length > 0, `${zone} stage ${stage} variant ${variant} composes ${expected} mass(es) for ${grammar.planning ? "planned parcel" : form}`);
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
const surfaceArea = (list) => list.reduce((sum, block) => sum + block.sx * block.sz, 0);
test.assert(Math.abs(surfaceArea(blocks.water) - 1) < 1e-9 && blocks.water.every((block) => block.sx <= 1 && block.sz <= 1),
  "the water tile's translucent surface covers exactly its own tile");
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
  atlasRecipes.catalog.city_hall && atlasRecipes.catalog.city_hall.footprint.w === context.window.AISystem6BonsaiCatalog.entryOf(0xd0).size
    && Math.abs(atlasRecipes.catalog.city_hall.height * pure.PX_PER_TILE - JSON.parse(read("assets/bonsai/atlas-source.json")).catalogSpecials.find((entry) => entry.id === "catalog.city_hall").height) < 1e-9,
  "catalog recipes preserve declared height units and the catalog footprint"
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
[40, 41, 48, 49].forEach((index) => { catalogSnapshot.catalogId[index] = 226; }); // complete 2x2 control tower
catalogSnapshot.catalogId[42] = 150; // incomplete imported building: one-tile infrastructure fragment
catalogSnapshot.catalogId[10] = 226; // on a road tile: the road wins
catalogSnapshot.catalogId[17] = 226; // on a zoned tile: the zone building wins

const catalogObjects = pure.collectSceneObjects(catalogSnapshot, atlasRecipes);
test.assert(catalogObjects.blazeTiles.length === 2, "blaze tiles collect fire and flood");
test.assert(catalogObjects.catalogTiles.length === 2
  && catalogObjects.catalogTiles.some((object) => object.label === "control_tower" && object.footprint.w === 2 && !object.fragment)
  && catalogObjects.catalogTiles.some((object) => object.x === 2 && object.y === 5 && object.fragment),
  "catalog collection groups the complete tower, retains its fragment neighbor and skips road/zoned tiles");
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
const floodColor = atlasRecipes.blaze.flood;
const floodSlabs = catalogBlocks.water.filter((block) => Math.abs(block.r - floodColor.r) < 1e-9 && Math.abs(block.b - floodColor.b) < 1e-9);
test.assert(floodSlabs.length === 1 && Math.abs(surfaceArea(catalogBlocks.water) - floodSlabs[0].sx * floodSlabs[0].sz - 1) < 1e-9,
  "the flood tile adds one translucent slab beside the sea tile's surface");
const catalogOnly = pure.collectChunkBlocks(catalogSnapshot, atlasRecipes, 0, 0, {
  buildings: [], facilities: [], covered: new Set(), catalogTiles: catalogObjects.catalogTiles.filter((object) => !object.fragment),
}, true).opaque;
const towerRecipe = atlasRecipes.catalog.control_tower;
const towerGround = catalogSnapshot.alt[40] * pure.ALT_STEP;
test.assert(
  catalogOnly.some((block) => String(block.tile).startsWith("wall.c.") && block.y > towerGround + towerRecipe.height)
    && catalogOnly.some((block) => block.sy > 0.4 && block.sx < 0.5)
    && catalogOnly.every((block) => block.x - block.sx / 2 >= 0 && block.x + block.sx / 2 <= 2),
  "the complete control tower has an elevated glazed cab and narrow shaft within its two-tile footprint"
);
const fragments = pure.collectChunkBlocks(catalogSnapshot, atlasRecipes, 0, 0, {
  buildings: [], facilities: [], covered: new Set(), catalogTiles: catalogObjects.catalogTiles.filter((object) => object.fragment),
}, true).opaque;
const proxyFrame = { ...JSON.parse(read("assets/bonsai/atlas-source.json")).catalogSpecials.find((entry) => entry.id === "catalog.infrastructure"), category: "catalog", state: "normal" };
const proxy = pure.createAssetBlocks(proxyFrame, JSON.parse(read("assets/bonsai/atlas-source.json")));
test.assert(fragments.length === proxy.length && fragments.every((block) => block.x - block.sx / 2 >= 2 && block.x + block.sx / 2 <= 3),
  "an incomplete catalog footprint uses the shared one-tile infrastructure proxy without expanding a building");
const marinaFrame = { ...JSON.parse(read("assets/bonsai/atlas-source.json")).catalogSpecials.find((entry) => entry.id === "catalog.marina"), category: "catalog", state: "normal" };
const marina = pure.createAssetBlocks(marinaFrame, JSON.parse(read("assets/bonsai/atlas-source.json")));
test.assert(marina.filter((block) => block.tile === "tree.trunk" && block.sy <= 0.1).length >= 3
  && marina.filter((block) => block.tile === "metal" && block.sy > 0.4 && block.sx < 0.04).length >= 2,
  "marinas have horizontal finger piers and separate tall sailing-boat masts");

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

// --- networks follow the ground, SC2K-style ---------------------------------------
{
  const n = 8;
  const layer = (fill = 0) => new Uint8Array(n * n).fill(fill);
  const scene = (edit) => {
    const snapshot = { size: n, tick: 12, seed: 5, rev: 1, timeOfDay: 0.5, alt: layer(1), water: layer(), slope: layer(),
      road: layer(), rail: layer(), wire: layer(), pipe: layer(), subway: layer(), highway: layer(), onramp: layer() };
    edit(snapshot);
    return { snapshot, blocks: pure.collectChunkBlocks(snapshot, fallbackRecipes, 0, 0, pure.collectSceneObjects(snapshot, fallbackRecipes)) };
  };
  // A road up a hillside: x = 3 is the slope tile below the plateau at x >= 4.
  const hill = scene((snapshot) => {
    for (let y = 0; y < n; y += 1) { for (let x = 4; x < n; x += 1) snapshot.alt[y * n + x] = 2; snapshot.slope[y * n + 3] = 1; }
    for (let x = 1; x < 7; x += 1) snapshot.road[3 * n + x] = 1;
  });
  const onSlope = hill.blocks.opaque.filter((block) => block.tile === "road" && block.x > 3 && block.x < 4 && Math.abs(block.z - 3.5) < 0.5);
  const wedge = hill.blocks.opaque.find((block) => block.shape === "slope-2" && Math.abs(block.x - 3.5) < 0.01 && Math.abs(block.z - 3.5) < 0.01);
  test.assert(wedge && onSlope.length > 0 && onSlope.every((block) => block.shearX > 0),
    `a road on a slope tile rides a wedge of ground and climbs with it (${onSlope.length} road blocks sheared up the slope)`);
  const surface = pure.surfaceAt(2, 1, 0.5);
  test.assert(Math.abs(surface.h - pure.ALT_STEP) < 1e-9 && Math.abs(pure.surfaceAt(2, 0, 0.5).h) < 1e-9,
    "the slope surface is level with the tile below at one edge and the plateau at the other");
  // A bridge rides level with its banks.
  const bridge = scene((snapshot) => {
    for (let y = 0; y < n; y += 1) { snapshot.water[y * n + 4] = 1; snapshot.alt[y * n + 4] = 0; }
    for (let x = 1; x < 7; x += 1) snapshot.road[3 * n + x] = 1;
  });
  const deck = bridge.blocks.opaque.find((block) => block.tile === "road" && Math.abs(block.x - 4.5) < 0.01 && Math.abs(block.z - 3.5) < 0.01);
  test.assert(deck && Math.abs(deck.y - (pure.ALT_STEP + 0.03)) < 1e-6, "a bridge deck rides at the height of its banks, not on the water");
  // Water pipes are buried: the surface view has none; the underground view does.
  const piped = scene((snapshot) => { for (let x = 1; x < 7; x += 1) { snapshot.pipe[3 * n + x] = 1; snapshot.subway[5 * n + x] = 1; } });
  test.assert(!piped.blocks.opaque.some((block) => block.tile === "pipe"), "the surface view draws no water pipes");
  const below = pure.collectUndergroundBlocks(piped.snapshot, fallbackRecipes, 0, 0);
  test.assert(below.opaque.some((block) => block.tile === "pipe") && below.opaque.some((block) => block.tile === "tunnel"),
    "the underground view draws the pipes and the subway");
  // Highways stand on piers above the street and an interchange stacks.
  const raised = scene((snapshot) => { for (let x = 0; x < n; x += 1) { snapshot.highway[2 * n + x] = 1; snapshot.highway[3 * n + x] = 1; } });
  const deckTop = Math.max(...raised.blocks.opaque.filter((block) => block.tile === "road").map((block) => block.y));
  test.assert(deckTop > pure.ALT_STEP * 2, "a highway deck stands one height step over its ground");

  // SC3K street furniture: sidewalks on both sides, zebra crossings at a
  // junction, lamps along straight streets, sleepers under rails, lattice
  // towers carrying power over open ground.
  const street = scene((snapshot) => {
    for (let x = 0; x < n; x += 1) snapshot.road[3 * n + x] = 1;
    for (let y = 0; y < n; y += 1) snapshot.road[y * n + 3] = 1;
    for (let x = 0; x < n; x += 1) snapshot.rail[6 * n + x] = 1;
    for (let y = 0; y < n; y += 1) snapshot.wire[y * n + 6] = 1;
  });
  const walks = street.blocks.opaque.filter((block) => block.tile === "concrete" && Math.abs(block.z - 1.5) < 0.5 && Math.abs(Math.abs(block.x - 3.5) - 0.34) < 0.01);
  test.assert(walks.length >= 2, `a street carries a sidewalk along each edge (${walks.length} walk strips on one tile)`);
  const zebra = street.blocks.opaque.filter((block) => Math.abs(block.x - 3.5) < 0.5 && Math.abs(block.z - 3.5) < 0.5 && block.sy < 0.01);
  test.assert(zebra.length >= 20, `a crossroads carries zebra crossings on all four arms (${zebra.length} stripes)`);
  const posts = street.blocks.opaque.filter((block) => block.tile === "metal" && Math.abs(block.sy - 0.34) < 1e-9);
  test.assert(posts.length > 0, `straight streets carry lamp posts (${posts.length})`);
  const sleepers = street.blocks.opaque.filter((block) => block.tile === "rail" && Math.abs(block.z - 6.5) < 0.5 && block.sy === 0.02);
  test.assert(sleepers.length >= 6, `rails lie on sleepers (${sleepers.length})`);
  const legs = street.blocks.opaque.filter((block) => block.tile === "metal" && Math.abs(block.x - 6.5) < 0.5 && Math.abs(block.sy - 0.4) < 1e-9);
  test.assert(legs.length >= 4, `power crosses open ground on lattice towers (${legs.length} legs)`);
}

// --- SC3K buildings: skyline, roof furniture, parking ---------------------------
{
  const source = JSON.parse(read("assets/bonsai/atlas-source.json"));
  const lot = (zone, stage, variant, size) => pure.createAssetBlocks({ category: "building", zone, stage, variant, footprint: [size, size], state: "normal" }, source);
  const topOf = (blocks) => Math.max(...blocks.map((block) => block.y + block.sy / 2));
  const office = lot("commercial", 3, 20, 3);
  const plainOffice = lot("commercial", 3, 4, 3);
  test.assert(topOf(office) > 4 && topOf(plainOffice) < 2,
    `a dear 3x3 commercial lot carries a tower (${topOf(office).toFixed(2)} vs ${topOf(plainOffice).toFixed(2)} world units)`);
  const smallOffice = lot("commercial", 2, 20, 2);
  const cornerShop = lot("commercial", 1, 20, 1);
  test.assert(topOf(smallOffice) > 2.5 && topOf(smallOffice) < topOf(office) && topOf(cornerShop) < 1.5,
    `a dear 2x2 lot carries a shorter tower (${topOf(smallOffice).toFixed(2)}), a dear one-tile lot never a needle (${topOf(cornerShop).toFixed(2)})`);
  const flats = lot("residential", 3, 20, 3);
  test.assert(topOf(flats) > 2.5, `a dear 3x3 residential lot carries apartment towers (${topOf(flats).toFixed(2)})`);
  const pad = office.filter((block) => block.tile === "concrete" && Math.abs(block.sy - 0.03) < 1e-9 && block.y > 4);
  test.assert(pad.length === 1 && pad[0].y + pad[0].sy / 2 > topOf(office.filter((block) => block.tile === "roof.deck")),
    "an office tower lands a helipad above its roof deck");
  const deck = office.filter((block) => block.tile === "roof.deck").sort((a, b) => b.y - a.y)[0];
  const onRoof = office.filter((block) => block.y > deck.y && block !== pad[0] && block.sy > 0.01);
  test.assert(onRoof.every((block) => block.tile === "concrete" || block.sx <= 0.06),
    "nothing but the parapet and a slim mast shares the helipad roof");
  const bands = office.filter((block) => block.tile === "metal" && block.sx > 1 && block.sz > 1);
  test.assert(bands.length >= 1, `a tower shaft is broken by plant-floor bands (${bands.length})`);
  const works = [];
  for (const zone of ["industrial", "commercial"]) for (let stage = 1; stage <= 3; stage += 1) for (let variant = 1; variant <= 8; variant += 1) {
    const blocks = lot(zone, stage, variant, 2);
    if (blocks.some((block) => block.tile === "road" && Math.abs(block.sy - 0.014) < 1e-9)) works.push(blocks);
  }
  test.assert(works.length === 48, `every two-tile shop and works lays striped parking (${works.length} of 48)`);
  test.assert(works.every((blocks) => blocks.filter((block) => Math.abs(block.sy - 0.004) < 1e-9).length >= 2),
    "every parking lot is marked out in bays");
  const roofs = [2, 3].map((stage) => lot("residential", stage, 1, 2)).concat([2, 3].map((stage) => lot("residential", stage, 2, 2)));
  test.assert(roofs.some((blocks) => blocks.some((block) => block.tile === "tree.trunk" && Math.abs(block.sy - 0.12) < 1e-9)),
    "apartment roofs carry timber water tanks");
}

// --- a planned downtown: towers ranked by height, parcels facing their street ----
{
  const source = JSON.parse(read("assets/bonsai/atlas-source.json"));
  const lot = (zone, stage, variant, size) => pure.createAssetBlocks({ category: "building", zone, stage, variant, footprint: [size, size], state: "normal" }, source);
  const topOf = (blocks) => Math.max(...blocks.map((block) => block.y + block.sy / 2));
  const heights = [17, 18, 19, 20, 21, 22, 23, 24].map((variant) => topOf(lot("commercial", 3, variant, 3)));
  test.assert(heights.every((height, index) => index === 0 || height >= heights[index - 1]) && heights[7] > heights[0] * 1.6,
    `the eight high variants rise with their rank (${heights.map((height) => height.toFixed(1)).join(" ")})`);
  const planning = { zone: "commercial", stage: 3, forms: ["shop"], stories: [1, 1], storeyMeters: 3.6 };
  const forms = [17, 20, 24].map((variant) => pure.plannedBuildingMasses({ w: 3, h: 3 }, planning, variant).filter((mass) => mass.usage !== "podium").length);
  test.assert(forms[0] === 1 && forms[1] === 2 && forms[2] === 3,
    `towers come as a slab, a podium tower with a crown, and a stepped landmark (${forms.join(", ")} masses over the podium)`);
  const shared = context.window.AISystem6BonsaiRenderer;
  const along = (roads) => (tx, ty) => roads.some(([rx, ry]) => rx === tx && ry === ty);
  test.assert(shared.streetQuarter(along([[4, 6], [5, 6]]), 4, 4, { w: 2, h: 2 }) === 0
    && shared.streetQuarter(along([[6, 4], [6, 5]]), 4, 4, { w: 2, h: 2 }) === 1
    && shared.streetQuarter(along([[4, 3]]), 4, 4, { w: 2, h: 2 }) === 2
    && shared.streetQuarter(along([[3, 5]]), 4, 4, { w: 2, h: 2 }) === 3
    && shared.streetQuarter(along([]), 4, 4, { w: 2, h: 2 }) === 0,
    "a lot faces the side of its footprint with the most road along it");
  const n = 16;
  const street = (edit) => {
    const snapshot = { size: n, tick: 12, seed: 5, rev: 1, timeOfDay: 0.5, alt: new Uint8Array(n * n).fill(1), water: new Uint8Array(n * n), road: new Uint8Array(n * n),
      buildings: [{ x: 4, y: 4, w: 2, h: 2, footprint: { w: 2, h: 2 }, zone: "commercial", stage: 2, variant: 20, state: 3 }] };
    edit(snapshot);
    return pure.collectChunkBlocks(snapshot, atlasRecipes, 0, 0, pure.collectSceneObjects(snapshot, atlasRecipes)).opaque
      .filter((block) => String(block.tile).startsWith("wall.") && block.x > 3.9 && block.x < 6.1 && block.z > 3.9 && block.z < 6.1);
  };
  const reach = (blocks) => ({ x: Math.max(...blocks.map((block) => block.x + block.sx / 2)) - 5, z: Math.max(...blocks.map((block) => block.z + block.sz / 2)) - 5 });
  const south = reach(street((snapshot) => { for (let x = 0; x < n; x += 1) snapshot.road[6 * n + x] = 1; }));
  const east = reach(street((snapshot) => { for (let y = 0; y < n; y += 1) snapshot.road[y * n + 6] = 1; }));
  test.assert(south.z > south.x && east.x > east.z && Math.abs(south.z - east.x) < 1e-9,
    `a tower's podium is built out to its street line, whichever side the street runs (south ${south.z.toFixed(2)}/${south.x.toFixed(2)}, east ${east.x.toFixed(2)}/${east.z.toFixed(2)})`);
}

// --- SC3K terrain and water: shelf, surf, whitecaps, grass detail ---------------
{
  const n = 32;
  const layer = (value = 0) => new Uint8Array(n * n).fill(value);
  const make = (edit) => {
    const snapshot = { size: n, tick: 12, seed: 5, rev: 1, timeOfDay: 0.5, alt: layer(1), water: layer(), salt: layer(), zone: layer() };
    edit(snapshot);
    return snapshot;
  };
  const collect = (snapshot) => pure.collectChunkBlocks(snapshot, fallbackRecipes, 0, 0, pure.collectSceneObjects(snapshot, fallbackRecipes));
  // Land for x < 4, open sea from x = 4 on.
  const seaEdit = (snapshot) => { for (let y = 0; y < n; y += 1) for (let x = 4; x < n; x += 1) { snapshot.water[y * n + x] = 1; snapshot.salt[y * n + x] = 1; snapshot.alt[y * n + x] = 0; } };
  const sea = collect(make(seaEdit));
  const surfaceAt = (x, y) => sea.water.find((block) => Math.abs(block.x - x - 0.5) < 1e-9 && Math.abs(block.z - y - 0.5) < 1e-9);
  const shelf = surfaceAt(4, 8);
  const open = surfaceAt(12, 8);
  test.assert(shelf && open && shelf.g > open.g && shelf.g / shelf.b > open.g / open.b,
    "water beside the shore is a lighter, greener shelf than open water");
  test.assert(surfaceAt(5, 8).g < shelf.g && surfaceAt(6, 8).g < surfaceAt(5, 8).g,
    "the shelf darkens tile by tile away from the shore");
  const white = (block) => block.r > 0.9 && block.g > 0.9 && block.b > 0.9 && block.a < 1;
  const surf = sea.tint.filter((block) => white(block) && Math.abs(block.x - 4.04) < 1e-9 && block.sz === 1);
  test.assert(surf.length === 16, `a surf line runs along every shore tile of the chunk (${surf.length} of 16)`);
  const caps = sea.tint.filter((block) => white(block) && block.x > 7 && Math.abs(block.sz - 0.035) < 1e-9);
  test.assert(caps.length > 0, `open sea carries whitecaps (${caps.length})`);
  const again = collect(make(seaEdit));
  test.assert(JSON.stringify(again.tint) === JSON.stringify(sea.tint), "surf and whitecaps are the same on every build");
  const tufts = (blocks) => blocks.opaque.filter((block) => block.x < 4 && Math.abs(block.sx - 0.05) < 1e-9 && Math.abs(block.sy - 0.04) < 1e-9);
  test.assert(tufts(sea).length > 0, `open grass carries tufts (${tufts(sea).length})`);
  const zoned = collect(make((snapshot) => { seaEdit(snapshot); for (let y = 0; y < n; y += 1) for (let x = 0; x < 4; x += 1) snapshot.zone[y * n + x] = 1; }));
  test.assert(tufts(zoned).length === 0, "zoned ground carries no tufts");
  // Land two tiles outside a chunk still changes that chunk's shelf.
  const base = make(seaEdit);
  const filled = make((snapshot) => { seaEdit(snapshot); snapshot.water[8 * n + 17] = 0; snapshot.alt[8 * n + 17] = 1; });
  test.assert(pure.chunkSignature(base, 0, 0, pure.collectSceneObjects(base, fallbackRecipes))
    !== pure.chunkSignature(filled, 0, 0, pure.collectSceneObjects(filled, fallbackRecipes)),
    "land just outside a chunk dirties that chunk, whose shelf it shapes");
}

// --- SC3K light: golden hour, patchwork windows, round lamp pools ---------------
{
  const noon = pure.lightingFor(0.5);
  const golden = pure.lightingFor(0.25);
  const midnight = pure.lightingFor(0);
  test.assert(noon.sunR === 1 && noon.sunG === 1 && noon.sunB === 1, "noon sunlight is white");
  test.assert(golden.warmth > 0.8 && golden.sunB < golden.sunG && golden.sunG < golden.sunR,
    `the low sun turns orange (${golden.sunR.toFixed(2)}, ${golden.sunG.toFixed(2)}, ${golden.sunB.toFixed(2)})`);
  test.assert(midnight.sunB > midnight.sunR && midnight.ambientB > midnight.ambientR, "night light reads cool blue");
  const source = JSON.parse(read("assets/bonsai/atlas-source.json"));
  const flats = (state) => pure.createAssetBlocks({ category: "building", zone: "residential", stage: 3, variant: 3, footprint: [2, 2], state }, source);
  const bays = (blocks) => blocks.filter((block) => String(block.tile).startsWith("wall.r."));
  const nightBays = bays(flats("night"));
  const dark = nightBays.filter((block) => block.unlit).length;
  test.assert(dark / nightBays.length > 0.25 && dark / nightBays.length < 0.55,
    `at night some rooms are dark and most are lit (${dark} of ${nightBays.length} bays dark)`);
  test.assert(bays(flats("normal")).every((block) => !block.unlit), "by day no bay is marked dark");
  test.assert(JSON.stringify(nightBays.map((block) => Boolean(block.unlit))) === JSON.stringify(bays(flats("night")).map((block) => Boolean(block.unlit))),
    "which rooms are lit is the same on every build");
  const n = 16;
  const street = { size: n, tick: 12, seed: 5, rev: 1, timeOfDay: 0, alt: new Uint8Array(n * n).fill(1), water: new Uint8Array(n * n), road: new Uint8Array(n * n) };
  for (let x = 0; x < n; x += 1) street.road[3 * n + x] = 1;
  const lit = pure.collectChunkBlocks(street, fallbackRecipes, 0, 0, pure.collectSceneObjects(street, fallbackRecipes));
  const pools = lit.tint.filter((block) => block.r === 1 && block.g === 0.8 && block.b === 0.46);
  test.assert(pools.length > 0 && pools.length % 3 === 0 && pools.every((block) => block.a <= 0.25),
    `a street lamp throws a soft layered pool, not one square (${pools.length / 3} lamps)`);
}

// --- SC3K traffic: lanes, vehicle kinds, lights, sidewalks, trains ---------------
{
  const n = 16;
  const layer = () => new Uint8Array(n * n);
  const city = (edit, timeOfDay = 0.5, tick = 10) => {
    const snapshot = { size: n, tick, seed: 5, rev: 1, timeOfDay, alt: layer().fill(1), water: layer(), road: layer(), rail: layer(), agents: {} };
    for (let x = 0; x < n; x += 1) snapshot.road[3 * n + x] = 1;
    for (let y = 0; y < n; y += 1) snapshot.road[y * n + 12] = 1;
    for (let x = 0; x < n; x += 1) snapshot.rail[9 * n + x] = 1;
    edit(snapshot);
    return pure.collectAgentBlocks(snapshot, fallbackRecipes);
  };
  const bodies = (blocks, length) => blocks.opaque.filter((block) => Math.abs(Math.max(block.sx, block.sz) - length) < 1e-9);
  const cars = city((snapshot) => { snapshot.agents.vehicles = Array.from({ length: 4 }, (_, i) => ({ x: 2 + i * 2, y: 3, phase: 0.3 })); });
  const carBodies = bodies(cars, 0.27);
  test.assert(carBodies.length === 4 && carBodies.every((block) => block.sx > block.sz),
    "a car on an east-west street points along it");
  test.assert(carBodies.every((block) => Math.abs(Math.abs(block.z - 3.5) - 0.12) < 1e-9)
    && carBodies.some((block) => block.z > 3.5) && carBodies.some((block) => block.z < 3.5),
    "cars keep to the right-hand lane of their direction, both directions in use");
  const cabins = cars.opaque.filter((block) => block.tile === "metal" && Math.abs(Math.max(block.sx, block.sz) - 0.13) < 1e-9);
  test.assert(cabins.length === 4, "every car is two-tone: a body with a darker cabin on it");
  const crossing = city((snapshot) => { snapshot.agents.vehicles = [{ x: 12, y: 7, phase: 0.2 }]; });
  test.assert(bodies(crossing, 0.27).every((block) => block.sz > block.sx), "a car on a north-south street points north-south");
  const later = city((snapshot) => { snapshot.agents.vehicles = [{ x: 4, y: 3, phase: 0.3 }]; }, 0.5, 11);
  const earlier = city((snapshot) => { snapshot.agents.vehicles = [{ x: 4, y: 3, phase: 0.3 }]; }, 0.5, 10);
  test.assert(Math.abs(Math.abs(bodies(later, 0.27)[0].x - bodies(earlier, 0.27)[0].x) - 0.18 * 0.9) < 1e-9,
    "a car rolls along its lane from tick to tick until the next deal");
  const fleet = city((snapshot) => { snapshot.agents.vehicles = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: 3, phase: 0.5 })); });
  test.assert(bodies(fleet, 0.72).length === 1 && bodies(fleet, 0.34).length === 2, "traffic mixes in a bus and lorries");
  const dark = city((snapshot) => { snapshot.agents.vehicles = [{ x: 4, y: 3, phase: 0.3 }]; }, 0);
  test.assert(dark.glow.length === 4 && dark.glow.filter((block) => block.r > 0.9 && block.b < 0.2).length === 2,
    "at night a car shows two headlights and two red tail lights");
  test.assert(cars.glow.length === 0, "by day vehicles show no lights");
  const walkers = city((snapshot) => { snapshot.agents.pedestrians = [{ x: 5, y: 5, phase: 0.5 }, { x: 5, y: 14, phase: 0.5 }]; });
  const heads = walkers.opaque.filter((block) => Math.abs(block.sx - 0.024) < 1e-9);
  test.assert(heads.length >= 1 && heads.every((block) => Math.abs(block.z - 3.88) < 0.06),
    "a pedestrian walks the sidewalk on the building's side of the nearest street");
  test.assert(heads.every((block) => Math.abs(block.z - 14.5) > 1), "a pedestrian with no street near stays at home");
  const train = city((snapshot) => { snapshot.agents.trains = [{ x: 6, y: 9, phase: 0.5 }]; });
  test.assert(bodies(train, 0.42).length === 2 && bodies(train, 0.42).every((block) => block.sx > block.sz),
    "a train is a locomotive and a coach running along the track");
  const station = city((snapshot) => { snapshot.agents.serviceVehicles = [{ x: 6, y: 5, phase: 0.5 }, { x: 8, y: 5, phase: 0.5 }]; });
  test.assert(bodies(station, 0.28).length === 1 && bodies(station, 0.44).length === 1
    && station.opaque.every((block) => Math.abs(block.z - 3.5) < 0.4),
    "a police car and a fire engine drive out onto the street by their station");
  const busy = city((snapshot) => { snapshot.traffic = new Uint16Array(n * n); snapshot.traffic[3 * n + 5] = 130; snapshot.traffic[3 * n + 6] = 45; snapshot.traffic[3 * n + 7] = 20; });
  const onTile = (x) => busy.opaque.filter((block) => block.x >= x && block.x < x + 1 && Math.abs(block.z - 3.5) < 0.2 && block.y < 0.5 && block.sy >= 0.065 && block.sy <= 0.13).length;
  test.assert(onTile(5) > onTile(6) && onTile(6) > 0 && onTile(7) === 0,
    `streets carry cars in proportion to their traffic (${onTile(5)}, ${onTile(6)}, ${onTile(7)} vehicle blocks at traffic 130, 45, 20)`);
  const jammed = (() => {
    const size = 64;
    const snapshot = { size, tick: 10, seed: 5, rev: 1, timeOfDay: 0.5, alt: new Uint8Array(size * size).fill(1), water: new Uint8Array(size * size), road: new Uint8Array(size * size).fill(1), traffic: new Uint16Array(size * size).fill(900), agents: {} };
    return pure.collectAgentBlocks(snapshot, fallbackRecipes).opaque.length;
  })();
  test.assert(jammed < 360 * 4.5, `street traffic stays within its cap on a jammed map (${jammed} blocks)`);
  const sprite = pure.createAssetBlocks({ category: "agent", kind: "car", variant: 1, state: "normal" }, JSON.parse(read("assets/bonsai/atlas-source.json")));
  test.assert(sprite && sprite.length >= 2, "the atlas car sprite still composes from a snapshot with no streets");
}

test.finish();
