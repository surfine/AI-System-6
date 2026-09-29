// Joyride / 兜风 contracts (STREETS-GAME-SPEC §9 P0).
//
// The picture: the Mac 8-bit system palette, 256-colour quantization, the
// thousands truncation and 1-bit Atkinson dithering produce known output.
// The car: fixed-step physics against a street world stops at walls, climbs
// kerbs and slopes, crosses a deck over water and replays digit for digit
// from a seed and an input list. The city: built in memory from the
// simulation's own replay and commands, never written into Bonsai City's
// saves. The module: lazy, reachable, and its core headless.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("joyride");
const coreSource = read("app/features/joyride-core.js");
const shellSource = read("app/features/joyride.js");
const context = vm.createContext({ window: {} });
vm.runInContext(coreSource, context);
const core = context.window.AISystem6JoyrideCore;
test.assert(Boolean(core), "the headless core installs without a DOM");

// --- the picture ---------------------------------------------------------------

const palette = core.PALETTE;
const entry = (i) => [palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2]];
const hex = (rgb) => rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
test.assert(palette.length === 768, "the system palette has 256 entries");
test.assert(hex(entry(0)) === "ffffff" && hex(entry(255)) === "000000", "white is entry 0 and black entry 255, as in the Mac CLUT");
test.assert(hex(entry(214)) === "000033", "the cube (less its black) fills entries 0..214 in descending order");
test.assert(hex(entry(215)) === "ee0000" && hex(entry(225)) === "00ee00" && hex(entry(235)) === "0000ee" && hex(entry(245)) === "eeeeee",
  "ten-step red, green, blue and grey ramps follow the cube");
test.assert(new Set(Array.from({ length: 256 }, (_, i) => hex(entry(i)))).size === 256, "all 256 entries are distinct");

const image = (pixels) => Uint8Array.from(pixels.flatMap(([r, g, b]) => [r, g, b, 255]));
const pixelsOf = (out) => Array.from({ length: out.length / 4 }, (_, i) => hex([out[i * 4], out[i * 4 + 1], out[i * 4 + 2]]));
const exact = [[0xff, 0x00, 0x00], [0x33, 0x99, 0xcc], [0x77, 0x77, 0x77], [0x00, 0x00, 0x11]];
const quantized = pixelsOf(core.quantize256(image(exact), 4, 1, new Uint8Array(16)));
test.assert(quantized.join(" ") === "ff0000 3399cc 777777 000011", `palette colours pass through unchanged (${quantized.join(" ")})`);
const near = pixelsOf(core.quantize256(image([[0xfa, 0x08, 0x06], [0x80, 0x80, 0x80], [0x31, 0x62, 0x9b]]), 3, 1, new Uint8Array(12)));
test.assert(near.join(" ") === "ff0000 888888 336699", `other colours go to their nearest entry (${near.join(" ")})`);
const everyEntry = new Set(Array.from({ length: 256 }, (_, i) => hex(entry(i))));
const ramp = image(Array.from({ length: 64 }, (_, i) => [i * 4, 255 - i * 3, (i * 37) % 256]));
test.assert(pixelsOf(core.quantize256(ramp, 64, 1, new Uint8Array(256))).every((p) => everyEntry.has(p)), "every quantized pixel is a palette entry");
const flipped = pixelsOf(core.quantize256(image([[255, 0, 0], [0, 0, 255]]), 1, 2, new Uint8Array(8), true));
test.assert(flipped.join(" ") === "0000ff ff0000", "a WebGL frame (bottom row first) comes out top row first");
const thousands = pixelsOf(core.quantizeThousands(image([[0x0f, 0x80, 0xff], [0x07, 0x08, 0x00]]), 2, 1, new Uint8Array(8)));
test.assert(thousands.join(" ") === "0884ff 000800", `thousands keeps five bits a channel (${thousands.join(" ")})`);

const flat = (value, w, h) => image(Array.from({ length: w * h }, () => [value, value, value]));
const inkShare = (out) => pixelsOf(out).filter((p) => p === "000000").length / (out.length / 4);
const monoWhite = core.ditherAtkinson(flat(255, 16, 16), 16, 16, new Uint8Array(1024));
const monoBlack = core.ditherAtkinson(flat(0, 16, 16), 16, 16, new Uint8Array(1024));
test.assert(inkShare(monoWhite) === 0 && inkShare(monoBlack) === 1, "white stays paper and black stays ink");
const monoGrey = core.ditherAtkinson(flat(128, 32, 32), 32, 32, new Uint8Array(4096));
test.assert(pixelsOf(monoGrey).every((p) => p === "000000" || p === "ffffff"), "Atkinson output is one bit");
test.assert(inkShare(monoGrey) > 0.4 && inkShare(monoGrey) < 0.6, `mid grey dithers to about half ink (${inkShare(monoGrey).toFixed(3)})`);
// Only 6/8 of the error travels, so a light grey keeps a clean highlight
// where Floyd-Steinberg would have sprinkled ink.
const monoLight = core.ditherAtkinson(flat(230, 32, 32), 32, 32, new Uint8Array(4096));
test.assert(inkShare(monoLight) < 0.05, `a light grey stays nearly clean paper (${inkShare(monoLight).toFixed(3)})`);
const gradient = image(Array.from({ length: 8 * 32 }, (_, i) => { const v = (i % 32) * 8; return [v, v, v]; }));
const bits = pixelsOf(core.ditherAtkinson(gradient, 32, 8, new Uint8Array(1024))).map((p) => (p === "000000" ? "1" : "0")).join("");
let digest = 2166136261;
for (let i = 0; i < bits.length; i += 1) digest = Math.imul(digest ^ bits.charCodeAt(i), 16777619) >>> 0;
test.assert(digest.toString(16) === "1fad4951", `the Atkinson pattern of a 32x8 ramp is pinned (${digest.toString(16)})`);
test.assert(core.RESOLUTIONS.mono.join("x") === "512x342" && core.RESOLUTIONS["256"].join("x") === "640x480", "black and white draws at 512x342, colour at 640x480");

// --- the street world and the car --------------------------------------------------

const L = 1 / 16; // one voxel layer, for the synthetic worlds
const M = core.METRE;
// A world from boxes: [x0, x1, z0, z1, bottom, top] in world units.
function worldOf(sizeTiles, boxes, water = []) {
  const world = core.createStreetWorld(sizeTiles, L);
  core.rasterizeChunk(world, {
    opaque: boxes.map(([x0, x1, z0, z1, bottom, top]) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: (bottom + top) / 2, sx: x1 - x0, sz: z1 - z0, sy: top - bottom })),
    water: water.map(([x0, x1, z0, z1, top]) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: top - 0.01, sx: x1 - x0, sz: z1 - z0, sy: 0.02 })),
  }, { surfaceAt: () => ({ h: 0 }), altStep: 0.25, modelRuns: () => null });
  return world;
}
const drive = (world, spawn, input, steps) => {
  const car = core.createCar(spawn);
  for (let i = 0; i < steps; i += 1) core.stepCar(car, input, world);
  return car;
};
const floor = [0, 8, 0, 8, -0.5, 0];
const full = { throttle: 1, brake: 0, steer: 0 };

const open = worldOf(8, [floor]);
const cruise = drive(open, { x: 1, z: 4, y: 0, heading: 0 }, full, 180);
test.assert(cruise.x > 2.5 && Math.abs(cruise.z - 4) < 1e-9 && cruise.y === 0, `full throttle drives straight along the road (x ${cruise.x.toFixed(3)})`);
test.assert(cruise.speed > 0 && cruise.speed <= core.CAR.topSpeed, "speed stays under the top speed");
const coast = drive(open, { x: 1, z: 4, y: 0, heading: 0 }, { throttle: 0, brake: 0, steer: 0 }, 60);
test.assert(coast.x === 1 && coast.speed === 0, "a car with no pedal pressed stays put");
const reverse = drive(open, { x: 4, z: 4, y: 0, heading: 0 }, { throttle: 0, brake: 1, steer: 0 }, 120);
test.assert(reverse.x < 4 && reverse.speed < 0, "holding the brake from a standstill reverses");
const turned = drive(open, { x: 2, z: 2, y: 0, heading: 0 }, { throttle: 0.6, brake: 0, steer: 1 }, 90);
test.assert(turned.heading > 0.3 && turned.z > 2, "steering right turns toward +z (the driver's right)");

// A wall three storeys high across the road at x = 3.
const walled = worldOf(8, [floor, [3, 3.5, 0, 8, 0, 3 * L]]);
const crash = drive(walled, { x: 1, z: 4, y: 0, heading: 0 }, full, 600);
test.assert(crash.x + core.CAR.halfLength <= 3 + 1e-9, `the car stops at the wall, never inside it (nose at ${(crash.x + core.CAR.halfLength).toFixed(4)})`);
test.assert(crash.speed === 0, "hitting the wall head-on stops the car");
const glance = drive(walled, { x: 1, z: 4, y: 0, heading: 0.35 }, full, 600);
test.assert(glance.x + core.CAR.halfLength <= 3 + 0.05 && glance.z > 4.2, "a glancing hit scrapes along the wall instead of passing through");

// A one-layer kerb is climbed; a two-layer ledge is a wall.
const kerb = worldOf(8, [floor, [3, 8, 0, 8, 0, L]]);
const overKerb = drive(kerb, { x: 1, z: 4, y: 0, heading: 0 }, full, 240);
test.assert(overKerb.x > 3.5 && Math.abs(overKerb.y - L) < 1e-9, "a kerb one voxel high is driven over");
const ledge = worldOf(8, [floor, [3, 8, 0, 8, 0, 2 * L]]);
const atLedge = drive(ledge, { x: 1, z: 4, y: 0, heading: 0 }, full, 240);
test.assert(atLedge.x + core.CAR.halfLength <= 3 + 1e-9 && atLedge.y === 0, "a ledge two voxels high stops the car");

// A slope made of thin steps rises one layer every two metres.
const steps = Array.from({ length: 64 }, (_, i) => [2 + i * 2 * M, 8, 0, 8, 0, (i + 1) * 0.5 * L]);
const hill = worldOf(8, [floor, ...steps]);
const climbed = drive(hill, { x: 1, z: 4, y: 0, heading: 0 }, full, 300);
test.assert(climbed.y > 5 * L && climbed.pitch > 0, `the car climbs a slope (y ${(climbed.y / L).toFixed(2)} layers, pitch ${climbed.pitch.toFixed(3)})`);

// Downhill under a power cable strung level from the top of the slope: the
// car's nose follows the road down, so the cable 4.5 layers over the lower
// road clears a 3.4-layer car even though it is lower than that over the
// car's highest wheel plus its height.
const downSteps = Array.from({ length: 32 }, (_, i) => [2 + i * M, 8, 0, 8, -0.5, (20 - (i + 1) * 0.5) * L]);
const cabled = worldOf(8, [[0, 2, 0, 8, -0.5, 20 * L], ...downSteps, [3, 3 + M, 0, 8, 16.5 * L, 16.7 * L]]);
const underCable = drive(cabled, { x: 1, z: 4, y: 20 * L, heading: 0 }, full, 300);
test.assert(underCable.x > 3.5, `a car running downhill passes under a level cable (x ${underCable.x.toFixed(3)})`);
// Water from x = 3 to 5; with a deck one layer above the banks it is a
// bridge, without one it stops the car at the shore.
const banks = [[0, 3, 0, 8, -0.5, 0], [5, 8, 0, 8, -0.5, 0], [3, 5, 0, 8, -0.5, -0.2]];
const lake = [[3, 5, 0, 8, -0.1]];
const shore = worldOf(8, banks, lake);
const atShore = drive(shore, { x: 1, z: 4, y: 0, heading: 0 }, full, 600);
test.assert(atShore.x + core.CAR.halfLength <= 3 + 1e-9, "open water stops the car at the shore");
const bridge = worldOf(8, [...banks, [3, 5, 3.3, 4.7, 0.3 * L, 0.9 * L]], lake);
const crossed = drive(bridge, { x: 1, z: 4, y: 0, heading: 0 }, full, 600);
test.assert(crossed.x > 5.5, `the car crosses the lake on the deck (x ${crossed.x.toFixed(3)})`);
const underDeck = worldOf(8, [floor, [3, 4, 0, 8, 6 * L, 7 * L]]);
const under = drive(underDeck, { x: 1, z: 4, y: 0, heading: 0 }, full, 420);
test.assert(under.x > 4.5 && under.y === 0, "a deck high overhead is driven under, not onto");
const lowDeck = worldOf(8, [floor, [3, 4, 0, 8, 2 * L, 3 * L]]);
const hitDeck = drive(lowDeck, { x: 1, z: 4, y: 0, heading: 0 }, full, 240);
test.assert(hitDeck.x + core.CAR.halfLength <= 3 + 1e-9, "a deck at cabin height is a wall");
// Spans arrive chunk by chunk, so a deck can land before the ground under
// it; the column comes out the same either way.
const columnOf = (order) => {
  const world = core.createStreetWorld(1, L);
  order.forEach(([bottom, top]) => core.applySpan(world, 0, bottom, top));
  return [world.groundBottom[0], world.ground[0], world.deckBottom[0], world.deckTop[0]].join(",");
};
const pieces = [[-0.25, 0], [0, L], [5 * L, 6 * L], [9 * L, 10 * L]];
test.assert(columnOf(pieces) === columnOf([...pieces].reverse()) && columnOf(pieces) === columnOf([pieces[2], pieces[0], pieces[3], pieces[1]]),
  `a column does not depend on the order its spans arrive (${columnOf(pieces)})`);
const edge = drive(open, { x: 1, z: 4, y: 0, heading: Math.PI }, full, 600);
test.assert(edge.x - core.CAR.halfLength >= 0, "the edge of the map is a wall");

// Replay: the same seed and inputs give the same drive, digit for digit.
const spawns = [{ x: 1, z: 2, y: 0, heading: 0 }, { x: 1, z: 6, y: 0, heading: 0 }, { x: 6, z: 2, y: 0, heading: Math.PI }];
const script = Array.from({ length: 900 }, (_, i) => ({ throttle: i % 300 < 200 ? 1 : 0, brake: i % 300 >= 250 ? 1 : 0, steer: Math.sin(i / 40) }));
const first = core.replay(walled, spawns, 1996, script);
const second = core.replay(walled, spawns, 1996, script.map((input) => ({ ...input })));
test.assert(first.digest === second.digest && first.car.x === second.car.x && first.car.heading === second.car.heading, `a replay is exact (${first.digest})`);
test.assert(first.digest === "28ecf28c", `the replay of seed 1996 is pinned (${first.digest})`);
const other = core.replay(walled, spawns, 11, script);
test.assert(other.digest !== first.digest, "another seed is another drive");

// --- the demonstration city ------------------------------------------------------------

const calls = [];
const stubSim = new Proxy({}, {
  get: (_, name) => (...args) => {
    calls.push(name);
    if (name === "replayExampleCity") return { tick: 3750, base: args[0] };
    if (name === "submitCommand") return { accepted: true, code: "ok", command: args[1] };
    throw new Error(`unexpected simulation call ${String(name)}`);
  },
});
core.buildDemoCity(stubSim);
test.assert(calls.join(",") === "replayExampleCity,submitCommand,submitCommand,submitCommand,submitCommand,submitCommand",
  `the town is the example's replay plus five road commands, nothing else (${calls.join(",")})`);
test.assert(core.DEMO_CITY.base === "starter-town" && core.DEMO_CITY.roads.every((road) => road.points.length === 2), "the demonstration town is Starter Town plus straight roads");
let refused = "";
try {
  core.buildDemoCity({ replayExampleCity: () => ({ tick: 1 }), submitCommand: () => ({ accepted: false, code: "funds" }) });
} catch (error) {
  refused = String(error.message);
}
test.assert(refused.startsWith("joyride-demo-road:bridge:funds"), "a road the simulation refuses is an error, not a silent gap");

for (const [name, source] of [["core", coreSource], ["shell", shellSource]]) {
  for (const needle of ["bonsaiCities", "encodeSave", "AISystem6BonsaiRepository", "indexedDB", "saveCity", "advanceTicks"]) {
    test.assertNotIncludes(source, needle, `the ${name} never touches Bonsai City's saves or clock (${needle})`);
  }
}
for (const needle of ["Math.random", "Date.now", "performance.now", "document.", "requestAnimationFrame", "setTimeout", "localStorage"]) {
  test.assertNotIncludes(coreSource, needle, `the core stays headless (${needle})`);
}
test.assertNotIncludes(shellSource, "Math.random", "the shell draws its seed from crypto, and the core never draws one");

// --- the module, the renderer, the preferences --------------------------------------------

const config = read("app/core/config.js");
const loader = config.slice(config.indexOf("const ensureJoyrideModule"), config.indexOf("]", config.indexOf("const ensureJoyrideModule")));
["app/features/bonsai-city-sim.js", "app/features/bonsai-renderer-voxel.js", "app/features/joyride-core.js", "app/features/joyride.js"].forEach((path) => {
  test.assertIncludes(loader, `"${path}"`, `the Joyride loader brings ${path}`);
});
test.assert(loader.indexOf("joyride-core.js") < loader.indexOf("joyride.js\""), "the core loads before the shell");
test.assertIncludes(config, '["styles.joyride.css"]', "the loader brings the lazy stylesheet with the module");
const runtimeManifest = read("tooling/runtime-manifest.mjs");
const lazyBlock = runtimeManifest.slice(runtimeManifest.indexOf("export const lazyRuntimePaths"));
test.assert(lazyBlock.includes('"app/features/joyride-core.js"') && lazyBlock.includes('"app/features/joyride.js"'), "both files are lazy runtime paths");
test.assert(!runtimeManifest.slice(0, runtimeManifest.indexOf("export const lazyRuntimePaths")).includes("joyride"), "neither file is in the eager bundle");
test.assertIncludes(read("tooling/style-manifest.mjs"), 'output: "styles.joyride.css"', "the stylesheet is a lazy style bundle");
test.assertIncludes(read("app/core/app-admissions.js"), 'joyride: { app: "joyride", load: ensureJoyrideModule, command: "open-joyride"', "Joyride is admitted by one row in the Games folder");
test.assertIncludes(read("app/core/system-icons.js"), '"rootline", "joyride"', "the glyph paints in every appearance until its era family exists");

const voxel = read("app/features/bonsai-renderer-voxel.js");
test.assertIncludes(voxel, "window.AISystem6BonsaiVoxelRendererFactory = createBonsaiVoxelRenderer", "the voxel renderer is a factory, so Joyride's street view is its own instance");
test.assertIncludes(voxel, "new THREE.PerspectiveCamera", "street mode draws through a perspective camera");
test.assertIncludes(voxel, "shadowMap.enabled = !state.street", "street mode draws without shadows");
test.assertIncludes(read("tooling/vendor/bonsai-renderer-entry.mjs"), "PerspectiveCamera", "the vendor subset exports the perspective camera");
test.assertIncludes(shellSource, "renderer.streetChunkBlocks(snapshot, cx, cy)", "collision is rasterized from the chunks the renderer draws");
test.assertIncludes(shellSource, "voxelModelVoxels(index)", "and from the same voxel models");

test.assertIncludes(shellSource, 'const PREFS_KEY = "ai-system6-joyride-prefs"', "preferences live in localStorage (D7)");
test.assertIncludes(shellSource, '<span class="select-wrap"><select data-joyride-pref="depth">', "the screen depth is the System 6 select harness");
["mono", "256", "thousands"].forEach((depth) => test.assertIncludes(shellSource, `<option value="${depth}"`, `the screen menu offers ${depth}`));
test.assertIncludes(shellSource, 'hasCapability?.("one-bit-chrome") ? "mono" : "256"', "a one-bit appearance defaults to the black-and-white screen");
test.assertIncludes(shellSource, "navigator.getGamepads", "a game controller drives");
test.assertIncludes(shellSource, "data-joyride-wheel", "touch has a steering wheel");
test.assertIncludes(shellSource, 'data-joyride-pedal="gas"', "touch has pedals");

test.finish();
