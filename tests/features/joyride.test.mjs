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
// A spawn on a bridge stands on the deck, not on the river bed under it
// (the demonstration town's fourth spawn is on the bridge).
const spanWorld = worldOf(64, [[40, 50, 26, 31, -0.5, 0], [40, 50, 28.2, 28.8, 4 * L, 6 * L]], [[40, 50, 26, 31, 2 * L]]);
const bridgeSpawn = core.spawnPoints(spanWorld, { spawns: [{ tileX: 44, tileY: 28, heading: 0 }] })[0];
test.assert(Math.abs(bridgeSpawn.y - 6 * L) < 1e-6, `a spawn on a bridge rests on the deck (y ${(bridgeSpawn.y / L).toFixed(2)} layers)`);
const offBridge = drive(spanWorld, bridgeSpawn, full, 120);
test.assert(offBridge.x > bridgeSpawn.x + 0.5 && Math.abs(offBridge.y - 6 * L) < 1e-6, "and drives along it from the first step");
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
// Bonsai City's slope roads can leave a kerb across the carriageway (at a
// tile seam) or a ridge (inside a tile, along the wedge's diagonal). The
// street view fills the low side up to a slope the car can climb -- drawn
// and solid -- and leaves poles, the kerb past a road's end and small steps
// alone.
const rowSnapshot = { size: 4, road: Uint8Array.from({ length: 16 }, (_, i) => (i >= 8 && i < 12 ? 1 : 0)) };
const fillFlat = (world, snapshot = rowSnapshot) => {
  const blocks = core.fillCarriageway(world, snapshot);
  core.rasterizeChunk(world, { opaque: blocks }, { surfaceAt: () => ({ h: 0 }), altStep: 0.25, modelRuns: () => null });
  return blocks;
};
const kerbed = () => worldOf(4, [[0, 2, 0, 4, -0.5, 0], [2, 4, 0, 4, -0.5, 2.5 * L]]);
const atKerb = drive(kerbed(), { x: 0.5, z: 2.5, y: 0, heading: 0 }, full, 300);
test.assert(atKerb.x + core.CAR.halfLength <= 2 + 1e-9, "without the fill a 2.5-layer seam across the road stops the car");
const kerbWorld = kerbed();
const kerbFill = fillFlat(kerbWorld);
test.assert(kerbFill.length > 0 && kerbFill.every((block) => block.x < 2 && block.sy > 0), `the low side of the seam is filled (${kerbFill.length} one-metre columns)`);
// Drawn smooth: each fill box only up to its lowest corner, a quad over it
// whose corners are shared with the neighbouring cells, so the eye sees a
// ramp instead of a flight of stairs; the boxes stay solid underneath.
const rampDrawn = core.rampSurface(kerbWorld, rowSnapshot, kerbFill);
test.assert(rampDrawn.positions.length === kerbFill.length * 18 && rampDrawn.blocks.length <= kerbFill.length
  && rampDrawn.blocks.every((block) => kerbFill.some((fill) => fill.x === block.x && fill.z === block.z && block.y + block.sy / 2 <= fill.y + fill.sy / 2 + 1e-9)),
  "the fill is drawn as a quad per cell over boxes no taller than the fill");
const cornerHeights = new Map();
let seamless = true;
for (let i = 0; i < rampDrawn.positions.length; i += 3) {
  const key = `${rampDrawn.positions[i].toFixed(6)},${rampDrawn.positions[i + 2].toFixed(6)}`;
  const h = rampDrawn.positions[i + 1];
  if (cornerHeights.has(key) && Math.abs(cornerHeights.get(key) - h) > 1e-9) seamless = false;
  cornerHeights.set(key, h);
}
test.assert(seamless, "neighbouring ramp quads meet at the same height: no steps in the drawn surface");
const upKerb = drive(kerbWorld, { x: 0.5, z: 2.5, y: 0, heading: 0 }, full, 300);
test.assert(upKerb.x > 2.5 && Math.abs(upKerb.y - 2.5 * L) < 1e-6, `then the car drives up onto the higher road (x ${upKerb.x.toFixed(3)})`);
const downKerb = drive(kerbWorld, { x: 3.5, z: 2.5, y: 2.5 * L, heading: Math.PI }, full, 300);
test.assert(downKerb.x < 1.5 && Math.abs(downKerb.y) < 1e-6, "and back down");
// A diagonal ridge two layers high across the road inside tile (1,2).
const ridgeBoxes = Array.from({ length: 16 }, (_, i) => [1 + i * M, 1 + (i + 1) * M, 2 + i * M, 2 + (i + 1) * M, 0, 2 * L]);
const ridgeWorld = worldOf(4, [[0, 4, 0, 4, -0.5, 0], ...ridgeBoxes]);
const blockedByRidge = drive(ridgeWorld, { x: 0.5, z: 2.5, y: 0, heading: 0 }, full, 300);
test.assert(blockedByRidge.x < 1.6, "a diagonal ridge across the road is a wall before the fill");
fillFlat(ridgeWorld);
const overRidge = drive(ridgeWorld, { x: 0.5, z: 2.5, y: 0, heading: 0 }, full, 300);
test.assert(overRidge.x > 2.5, `after the fill the car drives over it (x ${overRidge.x.toFixed(3)})`);
const poled = worldOf(4, [[0, 4, 0, 4, -0.5, 0], [2.5, 2.5 + M, 2.5, 2.5 + M, 0, 15 * L]]);
test.assert(core.fillCarriageway(poled, rowSnapshot).length === 0, "a pole standing in the road raises nothing around it");
const tSnapshot = { size: 4, road: Uint8Array.from({ length: 16 }, (_, i) => (i === 9 || i === 10 ? 1 : 0)) };
const beyondEnd = worldOf(4, [[0, 2.85, 0, 4, -0.5, 0], [2.85, 4, 0, 4, -0.5, 2 * L]]);
test.assert(core.fillCarriageway(beyondEnd, tSnapshot).length === 0, "the kerb past a road's end is not carriageway");
const gentle = worldOf(4, [[0, 2, 0, 4, -0.5, 0], [2, 4, 0, 4, -0.5, 0.4 * L]]);
test.assert(core.fillCarriageway(gentle, rowSnapshot).length === 0, "a step within the fill slope is left as it is");
const edge = drive(open, { x: 1, z: 4, y: 0, heading: Math.PI }, full, 600);
test.assert(edge.x - core.CAR.halfLength >= 0, "the edge of the map is a wall");

// Replay: the same seed and inputs give the same drive, digit for digit.
const spawns = [{ x: 1, z: 2, y: 0, heading: 0 }, { x: 1, z: 6, y: 0, heading: 0 }, { x: 6, z: 2, y: 0, heading: Math.PI }];
const script = Array.from({ length: 900 }, (_, i) => ({ throttle: i % 300 < 200 ? 1 : 0, brake: i % 300 >= 250 ? 1 : 0, steer: Math.sin(i / 40) }));
const first = core.replay(walled, spawns, 1996, script);
const second = core.replay(walled, spawns, 1996, script.map((input) => ({ ...input })));
test.assert(first.digest === second.digest && first.car.x === second.car.x && first.car.heading === second.car.heading, `a replay is exact (${first.digest})`);
test.assert(first.digest === "5727a701", `the replay of seed 1996 is pinned (${first.digest})`);
// Grip (2026-10-02): an ordinary turn holds its line; a fast full-lock turn
// slides wide; the handbrake swings the tail and leaves the car sliding.
const flatWorld = worldOf(40, [[0, 40, 0, 40, -0.5, 0]]);
const turnFrom = (speedKmh, steer, handbrake = 0, steps = 90) => {
  const car = core.createCar({ x: 20, z: 20, y: 0, heading: 0 });
  car.speed = speedKmh * M / 3.6;
  let maxSlip = 0;
  for (let i = 0; i < steps; i += 1) {
    core.stepCar(car, { throttle: car.speed < speedKmh * M / 3.6 ? 1 : 0, steer, handbrake }, flatWorld);
    maxSlip = Math.max(maxSlip, Math.abs(car.slip));
  }
  return { car, maxSlip: maxSlip / M };
};
test.assert(turnFrom(30, 0.6).maxSlip < 0.05, `a turn at town speed holds its line: no slide (${turnFrom(30, 0.6).maxSlip.toFixed(3)})`);
test.assert(turnFrom(100, 1).maxSlip > 1, `a full-lock turn at 100 km/h slides (${turnFrom(100, 1).maxSlip.toFixed(2)} m/s sideways)`);
const flick = turnFrom(70, 1, 1, 40);
const gripTurn = turnFrom(70, 1, 0, 40);
test.assert(flick.maxSlip > gripTurn.maxSlip + 1 && Math.abs(flick.car.heading) > Math.abs(gripTurn.car.heading),
  `the handbrake lets the tail out: more slide, more rotation (${flick.maxSlip.toFixed(2)} vs ${gripTurn.maxSlip.toFixed(2)} m/s)`);
test.assert(core.createCar({ x: 0, z: 0, y: 0 }).slip === 0, "a new car is not sliding");
// Damage (spec §3.4): a hard hit dents the car; a wrecked car's engine dies.
const wallWorld = worldOf(8, [[0, 8, 0, 8, -0.5, 0], [5, 6, 0, 8, 0, 20 * L]]);
const ram = core.createCar({ x: 2, z: 4, y: 0, heading: 0 });
ram.speed = 60 * M / 3.6;
for (let i = 0; i < 400 && ram.speed !== 0; i += 1) core.stepCar(ram, { throttle: ram.speed < 60 * M / 3.6 ? 1 : 0 }, wallWorld);
test.assert(ram.damage > 20 && ram.damage < 100, `a 60 km/h hit on a wall dents the car (${ram.damage.toFixed(1)}%)`);
const nudge = core.createCar({ x: 2, z: 4, y: 0, heading: 0 });
nudge.speed = 8 * M / 3.6;
for (let i = 0; i < 200 && nudge.x < 4.9; i += 1) core.stepCar(nudge, { throttle: 0.3 }, wallWorld);
test.assert((nudge.damage || 0) < 1, "parking against a wall does nothing");
const wreck = core.createCar({ x: 2, z: 4, y: 0, heading: 0 });
wreck.damage = 100;
for (let i = 0; i < 60; i += 1) core.stepCar(wreck, { throttle: 1 }, wallWorld);
test.assert(wreck.speed === 0, "a wrecked car does not move under its own power");
test.assertIncludes(read("app/features/joyride.js"), "newDrive(best);\n    if (game.traffic) game.traffic.money -= TOW_FEE;", "a wreck is towed to the nearest start, for a fee");
test.assertIncludes(read("app/features/joyride-traffic.js"), "agent.braking = target < agent.speed - 0.5 * KMH", "the cars ahead show brake lights while they slow or stand");
test.assertIncludes(read("app/features/joyride.js"), 'Space: "handbrake",', "Space pulls the handbrake");
test.assertIncludes(read("app/features/joyride.js"), 'data-joyride-pedal="handbrake"', "and a lever over the brake pedal does on a phone");
test.assertIncludes(read("app/features/joyride.js"), "handbrake: button(1),", "B on a game controller is the handbrake");
test.assertIncludes(read("app/features/joyride.js"), "...game.skids, ...carLamps(car, glyph)", "sliding tyres leave marks on the road, and the car shows brake and tail lights");
test.assertIncludes(read("app/features/joyride.js"), "ctx.rotate(-car.heading - Math.PI / 2);", "the radar turns with the car, which always points up");
test.assertIncludes(read("app/features/joyride.js"), "const GEARS = [0, 22, 45, 70, 95, 125];", "the engine is heard through five gears");
test.assertIncludes(read("app/features/joyride.js"), "else if (!game.titleSeen) showTitle();", "the first town a window opens on starts with the title over an orbit of the streets");
test.assertIncludes(read("app/features/joyride.js"), 'matchMedia("(prefers-reduced-motion: reduce)")', "Reduce Motion is respected: no orbit, no shake, the descent lands at once");
test.assertIncludes(read("app/features/joyride.js"), "game.titleExit = { start: performance.now(), duration: 1100, from: game.titlePose }", "leaving the title is one continuous camera move, not a cut");
test.assertNotIncludes(read("app/styles/99-joyride.css".replace("app/styles", "styles")), "text-overflow: ellipsis", "nothing in Joyride's own text is cut short with an ellipsis");
test.assertIncludes(read("app/features/joyride.js"), "    if (!game.car || game.phase === \"loading\" || game.phase === \"failed\") return;\n    hideTitle();", "and any pedal, arrow or click goes straight to driving");
test.assertIncludes(read("app/features/joyride.js"), "const type = game.snapshot?.weather?.type;", "the street shows Bonsai City's own weather for the day");
test.assertIncludes(read("app/features/joyride.js"), 'if (weather === "foggy") far = Math.min(far, 6);', "fog shuts the street in to about a hundred metres");
test.assertIncludes(read("app/features/bonsai-renderer-voxel.js"), "Golden hour: the horizon warms to amber", "the street sky warms at golden hour and greys under rain, snow and fog");
test.assertIncludes(read("app/features/joyride.js"), "Math.floor(now / 0.45) % 2 ? 880 : 660", "a chasing police car sounds its two-tone siren");
test.assertIncludes(read("app/features/joyride.js"), 'banner(kind(event.kind), job ? t("joyride_banner_deadline"', "a job taken shows a card with its time limit");
test.assertIncludes(read("app/features/joyride.js"), "cityId: city.cityId || city.ref?.cityId || null, fingerprint: city.fingerprint || city.ref?.fingerprint || null", "a town from Bonsai City carries its save id and city fingerprint (also inside a v2 hand-over's ref)");
// The shared world (pot-world): when it is loaded, Joyride takes its names,
// its road-traffic curve, its letter and the mayor's stamped hour.
test.assertIncludes(read("app/features/joyride.js"), "const named = gazetteer.stationName({ kind: station.kind === \"subway\" ? \"subway-station\" : \"station\"", "stations take the gazetteer's names when the shared core is loaded");
test.assertIncludes(read("app/features/joyride.js"), "const where = gazetteer.streetAt(x, y) || gazetteer.districtAt(x, y);", "the area line leads with the street or district name");
test.assertIncludes(read("app/features/joyride.js"), "posted = Boolean(world.postLetter(world.letters.compose({", "the letter is the canon's own basin-letter when the core can compose it");
test.assertIncludes(read("app/features/joyride.js"), "const bits = world.sealBits(game.town.cityId, game.town.name);", "a photo carries the pot's seal and its district and date when the shared core is loaded");
test.assertIncludes(read("app/features/joyride.js"), "if (city.v === 2) Object.assign(source, { v: 2,", "a v2 hand-over keeps the mayor's stamped hour, day and season");
test.assertIncludes(read("app/features/joyride.js"), 'game.loadPromise = (async () => loadTown(pending || (await lastTownSource()) || { kind: "demo" }))();', "opening Joyride goes back to the pot last driven, if its save is still there (Basin J5)");
test.assertIncludes(read("app/features/joyride.js"), "street().jobBearing(traffic, car)", "and shows the job's target, pinned to the rim when it is further off");
const other = core.replay(walled, spawns, 11, script);
test.assert(other.digest !== first.digest, "another seed is another drive");

// --- the demonstration city (Hezhou, 1952) ----------------------------------------------
// Joyride's default town is Bonsai City's own Hezhou recipe, replayed by the
// simulation and read only through its render snapshot: no private recipe, no
// commands Joyride lays itself. The recipe's command log carries the avenue,
// the railway with a station at each end, and the transitLines sidecar the
// street reads bus lanes and stops from.
const simContext = vm.createContext({ window: {}, console });
vm.runInContext(read("app/features/bonsai-city-sim.js"), simContext);
const bonsaiSim = simContext.window.AISystem6BonsaiSim;
const hezhouRecipe = bonsaiSim.EXAMPLES["hezhou-1952"];
test.assert(Boolean(hezhouRecipe) && hezhouRecipe.size === 64, "Hezhou is the simulation's own 1952 example, 64 tiles square");
// The recipe lays the avenue, the railway and both stations as its own
// commands; Joyride adds nothing to the town.
const hezhouPaths = hezhouRecipe.commandLog.map((command) => command.clientCommandId);
["hezhou-avenue", "hezhou-rail", "hezhou-west-station", "hezhou-east-station"].forEach((id) =>
  test.assert(hezhouPaths.includes(id), `the Hezhou recipe lays ${id} itself`));
test.assert(!hezhouRecipe.transitLines, "the Hezhou recipe currently carries no transitLines sidecar (reported: Joyride invents no private lines)");

const hezhouState = bonsaiSim.replayExampleCity("hezhou-1952");
const hezhou = bonsaiSim.buildRenderSnapshot(hezhouState);
// The layer is a typed array like the snapshot's other layers (road is a Uint8Array too).
test.assert(hezhou.size === 64 && ArrayBuffer.isView(hezhou.avenue) && hezhou.avenue.length === 64 * 64,
  "the replayed town's snapshot already carries the avenue layer (its own recipe, not written by Joyride)");
const hezhouAvenue = core.avenueLayer(hezhou);
test.assert(hezhouAvenue && hezhouAvenue[18 * 64 + 15] === 8 && hezhouAvenue[19 * 64 + 15] === 2,
  "avenue geometry comes off the snapshot: the north half westbound, the south half eastbound, each partner on the other's left");
let avenueRunNorth = true, avenueRunSouth = true;
for (let x = 15; x <= 35; x += 1) {
  if (hezhouAvenue[18 * 64 + x] !== 8) avenueRunNorth = false;
  if (hezhouAvenue[19 * 64 + x] !== 2) avenueRunSouth = false;
}
test.assert(avenueRunNorth && avenueRunSouth,
  "the whole 15..35 stretch is one avenue: every north-half tile westbound, every south-half tile eastbound");
let hezhouAvenueTiles = 0;
for (let i = 0; i < 64 * 64; i += 1) if (hezhouAvenue[i]) hezhouAvenueTiles += 1;
test.assert(hezhouAvenueTiles === 42, `the avenue is exactly those two 21-tile halves (${hezhouAvenueTiles} tiles)`);

// P3: one railway, a station at each end, and the railway kept on its own
// layer (the road crossing it on the level is a road tile, not a rail
// overlay painted onto the road).
let hezhouRail = 0, railRun = true, railOnRoad = [];
for (let x = 15; x <= 60; x += 1) {
  const tile = 39 * 64 + x;
  if (hezhou.rail[tile]) hezhouRail += 1; else railRun = false;
  if (hezhou.rail[tile] && hezhou.road[tile]) railOnRoad.push(`${x},39`);
}
hezhou.facilities.filter((facility) => facility.kind === "station").forEach((station) => {
  const w = Number(station.footprint?.w) || Number(station.w) || 2;
  const h = Number(station.footprint?.h) || Number(station.h) || 2;
  let touches = false;
  for (let y = station.y - 1; y <= station.y + h; y += 1) for (let x = station.x - 1; x <= station.x + w; x += 1) {
    if (x >= 0 && y >= 0 && x < 64 && y < 64 && hezhou.rail[y * 64 + x]) touches = true;
  }
  test.assert(touches, `the station at ${station.x},${station.y} stands on the railway`);
});
let railTilesTotal = 0;
for (let i = 0; i < 64 * 64; i += 1) if (hezhou.rail[i]) railTilesTotal += 1;
const hezhouStations = hezhou.facilities.filter((facility) => facility.kind === "station");
const hasStationAt = (x, y) => hezhouStations.some((station) => {
  const sw = Number(station.footprint?.w) || Number(station.w) || 2;
  const sh = Number(station.footprint?.h) || Number(station.h) || 2;
  return x >= station.x && x < station.x + sw && y >= station.y && y < station.y + sh;
});
test.assert(railRun && hezhouRail === 46 && railTilesTotal === 46 && hezhouStations.length === 2,
  `the town has one railway straight along y=39 from x=15 to x=60, with a station at each end (${railTilesTotal} rail tiles, ${hezhouStations.length} stations)`);
test.assert(hasStationAt(16, 40) && hasStationAt(61, 38),
  "the two stations stand at the recipe's own west (16,40) and east (61,38) ends");
test.assert(railOnRoad.join("|") === "21,39",
  `the only tile carrying both a road and the railway is the level crossing at 21,39 (${railOnRoad.join(", ") || "none"})`);

// Transit forwarding: Hezhou's state carries no sidecar, so the street is
// handed none and invents no bus lanes or stops; a state that does carry one
// forwards exactly those lines.
const hezhouStreets = core.streetLayers(hezhou, hezhouState.transitLines || null);
test.assert(!hezhouStreets.busLane && !hezhouStreets.busStop,
  "with no sidecar the street lays no bus lane or stop of its own");
const sidecar = {
  version: 1,
  lines: [
    { id: "B1", mode: "brt", color: 0, tiles: Array.from({ length: 21 }, (_, i) => [15 + i, 18]).flat(), stations: [{ x: 17, y: 18, kind: "bus-stop", name: { zh: "站", en: "stop" } }] },
    { id: "3", mode: "bus", color: 1, tiles: [14, 21, 15, 21, 16, 21], stations: [{ x: 15, y: 21, kind: "bus-stop", name: { zh: "站", en: "stop" } }] },
  ],
};
const forwarded = core.streetLayers(hezhou, sidecar);
test.assert(forwarded.busLane?.[18 * 64 + 15] === 1 && forwarded.busLane?.[19 * 64 + 15] === 1,
  "a BRT line's bus lane fills its avenue half and the partner half");
test.assert(forwarded.busStop?.[18 * 64 + 17] === 2 && forwarded.busStop?.[19 * 64 + 17] === 2,
  "a BRT stop on the avenue is an island platform on both halves");
test.assert(forwarded.busStop?.[21 * 64 + 15] === 1, "an ordinary bus stops at the kerb (1)");
// The snapshot handed in is never mutated: the sidecar is read, not written.
test.assert(hezhou.busLane === undefined && hezhou.busStop === undefined && forwarded !== hezhou && forwarded.avenue !== hezhou.avenue,
  "streetLayers returns a fresh snapshot and never writes the one handed in");

// Spawns for the default town come from the city's own roads, not a private
// demo recipe: the Hezhou replay needs none of its own.
const hezhouSpawns = core.citySpawns(hezhou);
test.assert(hezhouSpawns.length > 0 && hezhouSpawns.every((spawn) => hezhou.road[spawn.tileY * 64 + spawn.tileX]),
  `the default town's spawns lie on its own roads (${hezhouSpawns.length} starts)`);
test.assert(core.spawnPoints(worldOf(64, [[0, 64, 0, 64, -0.5, 0]]), { spawns: hezhouSpawns }).length === hezhouSpawns.length,
  "and they convert to world spawn points like any other city");

// --- the headless core holds no Bonsai City saves or clock of its own --------------------

for (const needle of ["bonsaiCities", "encodeSave", "AISystem6BonsaiRepository", "indexedDB", "saveCity", "advanceTicks", "submitCommand(state, {\n        schemaVersion: 2,\n        type: \"zone"]) {
  test.assertNotIncludes(coreSource, needle, `the core never touches Bonsai City's saves or clock (${needle})`);
}
// The shell may read a player's Bonsai City saves to drive them (P2), and
// only read: one read-only transaction, no write of any kind, no encoding.
for (const needle of ["readwrite", "encodeSave", "AISystem6BonsaiRepository", "saveCity", "advanceTicks"]) {
  test.assertNotIncludes(shellSource, needle, `the shell never writes Bonsai City's saves or advances a city (${needle})`);
}
test.assertIncludes(shellSource, 'db.transaction(store, "readonly")', "saved cities are listed in a read-only transaction");
const storeUses = [...shellSource.matchAll(/objectStore\(([^)]*)\)\.(\w+)\(/g)].map((match) => match[2]);
test.assert(storeUses.length === 1 && storeUses[0] === "getAll", `the only object-store call is getAll (${storeUses.join(", ")})`);
test.assertIncludes(shellSource, "await sim.decodeSave(envelope)", "a saved city is decoded into a fresh state, a copy the drive can never write back");
const bonsaiShell = read("app/features/bonsai-city.js");
test.assertIncludes(bonsaiShell, "structuredClone(sim().buildRenderSnapshot(state.current))", "Bonsai City hands Joyride a deep copy, so the running simulation never moves a building under the car");
test.assertIncludes(bonsaiShell, 'item("drive-streets", "bonsai_drive_streets")', "Bonsai City's File menu offers to drive its streets");
for (const needle of ["Math.random", "Date.now", "performance.now", "document.", "requestAnimationFrame", "setTimeout", "localStorage"]) {
  test.assertNotIncludes(coreSource, needle, `the core stays headless (${needle})`);
}
test.assertNotIncludes(shellSource, "Math.random", "the shell draws its seed from crypto, and the core never draws one");

// --- the module, the renderer, the preferences --------------------------------------------

const config = read("app/core/config.js");
const loader = config.slice(config.indexOf("const ensureJoyrideModule"), config.indexOf("]", config.indexOf("const ensureJoyrideModule")));
["app/core/wasm-host-contract.js", "app/features/bonsai-city-sim.js", "app/features/bonsai-renderer-voxel.js", "app/features/joyride-core.js", "app/features/joyride.js"].forEach((path) => {
  test.assertIncludes(loader, `"${path}"`, `the Joyride loader brings ${path}`);
});
test.assert(loader.indexOf("joyride-core.js") < loader.indexOf("joyride.js\""), "the core loads before the shell");
test.assertIncludes(config, '["styles.joyride.css"]', "the loader brings the lazy stylesheet with the module");
test.assertIncludes(shellSource, "AISystem6WasmHostContract", "Joyride applies the shared host honesty contract");
test.assertIncludes(shellSource, "wasm: 0", "Joyride is an honest non-Wasm shell (data-wasm=0)");
test.assertIncludes(shellSource, "binary: 0", "Joyride never claims a Wasm binary");
const runtimeManifest = read("tooling/runtime-manifest.mjs");
const lazyBlock = runtimeManifest.slice(runtimeManifest.indexOf("export const lazyRuntimePaths"));
test.assert(lazyBlock.includes('"app/features/joyride-core.js"') && lazyBlock.includes('"app/features/joyride.js"'), "both files are lazy runtime paths");
test.assert(!runtimeManifest.slice(0, runtimeManifest.indexOf("export const lazyRuntimePaths")).includes("joyride"), "neither file is in the eager bundle");
test.assertIncludes(read("tooling/style-manifest.mjs"), 'output: "styles.joyride.css"', "the stylesheet is a lazy style bundle");
test.assertIncludes(read("app/core/app-admissions.js"), 'joyride: { app: "joyride", load: ensureJoyrideModule, command: "open-joyride"', "Joyride is admitted by one row in the Games folder");
test.assertIncludes(read("app/core/system-icons.js"), 'rootline joyride mingwen', "Joyride belongs to the complete era artwork vocabulary");

const voxel = read("app/features/bonsai-renderer-voxel.js");
test.assertIncludes(voxel, "window.AISystem6BonsaiVoxelRendererFactory = createBonsaiVoxelRenderer", "the voxel renderer is a factory, so Joyride's street view is its own instance");
test.assertIncludes(voxel, "new THREE.PerspectiveCamera", "street mode draws through a perspective camera");
test.assertIncludes(voxel, "state.street && THREE.BasicShadowMap !== undefined ? THREE.BasicShadowMap", "street mode casts hard-edged shadows: a filtered penumbra would turn to grain in the palette pass");
test.assertIncludes(voxel, "state.sun.castShadow = !(state.street && state.streetNight)", "and none in the character drive's night");
test.assertIncludes(voxel, "const flatAo = ao && state.street", "the street view's occlusion is one value per face (flat-shaded, no banding)");
test.assertIncludes(voxel, "From the street the rim follows the ground along the town's edge", "the pot's rim stands one step above the ground at the town's edge, as a low glazed wall (Basin J3)");
test.assertIncludes(voxel, "box(state.potMaterials.desk, mid, bottom - 0.5, mid, size * 9, 0.1, size * 9, false)", "and beyond it the pot stands on the gardener's desk");
test.assertIncludes(read("tooling/vendor/bonsai-renderer-entry.mjs"), "PerspectiveCamera", "the vendor subset exports the perspective camera");
test.assertIncludes(voxel, "gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)", "street frames are read back behind a fence, without stalling on the GPU");
test.assertIncludes(shellSource, "live && renderer.readPixelsAsync ? renderer.readPixelsAsync(game.pixels)", "the driving loop uses the stall-free readback");
test.assertIncludes(shellSource, "renderer.streetChunkBlocks(snapshot, cx, cy)", "collision is rasterized from the chunks the renderer draws");
test.assertIncludes(shellSource, "voxelModelVoxels(index)", "and from the same voxel models");
test.assertIncludes(shellSource, "renderer.setStreetExtras(game.ramps)", "the carriageway fill is drawn by the street renderer as well as made solid");

test.assertIncludes(shellSource, 'const PREFS_KEY = "ai-system6-joyride-prefs"', "preferences live in localStorage (D7)");
test.assertIncludes(shellSource, '<span class="select-wrap"><select data-joyride-pref="depth">', "the screen depth is the System 6 select harness");
["mono", "256", "thousands"].forEach((depth) => test.assertIncludes(shellSource, `<option value="${depth}"`, `the screen menu offers ${depth}`));
test.assertIncludes(shellSource, 'hasCapability?.("one-bit-chrome") ? "mono" : "256"', "a one-bit appearance defaults to the black-and-white screen");
test.assertIncludes(shellSource, "navigator.getGamepads", "a game controller drives");
test.assertIncludes(shellSource, "data-joyride-wheel", "touch has a steering wheel");
test.assertIncludes(shellSource, 'data-joyride-pedal="gas"', "touch has pedals");

// --- any city (P2: driving into your own Bonsai City) ---------------------------
// Spawns come from the city's own roads: straight, dry, level, no power
// line, nearest to the tile the player was looking at; a city without roads
// still gets a place to stand.
const grid = (size, cells) => { const a = new Uint8Array(size * size); cells.forEach(([x, y]) => { a[y * size + x] = 1; }); return a; };
const lane = Array.from({ length: 12 }, (_, i) => [i, 5]);
const cityA = { size: 12, road: grid(12, [...lane, [6, 4], [6, 6]]), wire: grid(12, [[2, 5]]), slope: grid(12, [[9, 5]]), water: grid(12, []) };
const spawnsA = core.citySpawns(cityA, { x: 4, y: 5 });
test.assert(spawnsA.length > 0 && spawnsA.every((spawn) => spawn.tileY === 5 && (spawn.heading === 0 || spawn.heading === Math.PI)), `spawns lie along the east-west road, facing along it (${JSON.stringify(spawnsA)})`);
test.assert(!spawnsA.some((spawn) => [2, 6, 9].includes(spawn.tileX)), "never on a power-line tile, a junction or a slope");
test.assert(spawnsA.every((spawn) => Math.abs(spawn.tileX - 6) >= 3) && spawnsA[0].tileX === 3 && spawnsA.every((spawn, i) => i === 0 || Math.abs(spawn.tileX - spawnsA[i - 1].tileX) >= 3),
  `nearest to where the player was looking first that keeps three tiles clear of the junction, three tiles apart (${spawnsA.map((spawn) => spawn.tileX)})`);
test.assert(spawnsA[0].heading === Math.PI, "and facing away from the junction, so the first seconds are not a red light");
const noRoads = core.citySpawns({ size: 8, road: grid(8, []), spawnCenter: { x: 3, y: 4 } });
test.assert(noRoads.length === 1 && noRoads[0].tileX === 3 && noRoads[0].tileY === 4, "a city without roads starts at its spawn centre");

// --- P1: the town around the car ---------------------------------------------
// Traffic, signals, pedestrians, payphones and jobs, wanted and police, and
// the shift: headless, deterministic, on a small synthetic town.
vm.runInContext(read("app/features/joyride-traffic.js"), context);
const traffic = context.window.AISystem6JoyrideTraffic;
test.assert(Boolean(traffic), "the traffic core installs without a DOM");
const trafficSource = read("app/features/joyride-traffic.js");
for (const needle of ["Math.random", "Date.now", "performance.now", "document.", "requestAnimationFrame", "setTimeout", "localStorage"]) {
  test.assertNotIncludes(trafficSource, needle, `the traffic core stays headless (${needle})`);
}
const T = 16;
const townLayer = (fn) => Uint8Array.from({ length: T * T }, (_, i) => fn(i % T, Math.floor(i / T)));
const isTownRoad = (x, y) => ((y === 4 || y === 11) && x >= 1 && x <= 14) || ((x === 4 || x === 11) && y >= 1 && y <= 14);
const town = {
  size: T,
  road: townLayer(isTownRoad),
  traffic: townLayer((x, y) => (isTownRoad(x, y) ? 90 : 0)),
  zone: townLayer((x, y) => (y === 3 && x >= 5 && x <= 10 ? 2 : y === 12 && x >= 5 && x <= 10 ? 1 : x === 12 && y >= 5 && y <= 10 ? 3 : 0)),
  water: townLayer(() => 0),
  facilities: [{ kind: "police", x: 2, y: 2 }],
};
const townWorld = worldOf(T, [[0, T, 0, T, -0.5, 0]]);
const graph = traffic.buildRoadGraph(town);
test.assert(graph.roads.length === 4 * 14 - 4 && new Set(graph.roads.map((tile) => graph.component[tile])).size === 1, "the road network is one connected loop of four streets");
test.assert(graph.armCount(4 * T + 4) === 4 && graph.armCount(4 * T + 1) === 1, "a crossing has four arms, a street end one");
const KMH = M / 3.6;
const straight = traffic.tilePath(T, 4 * T + 6, 2, 2, 2.5 * M);
const start = straight.at(0), finish = straight.at(straight.length);
test.assert(Math.abs(straight.length - 1) < 1e-6 && Math.abs(start.z - (4.5 + 2.5 * M)) < 1e-9 && Math.abs(start.heading) < 1e-6, "an eastbound car keeps the right-hand lane through a tile");
const turn = traffic.tilePath(T, 4 * T + 4, 2, 4, 2.5 * M);
const turnEnd = turn.at(turn.length);
test.assert(Math.abs(turnEnd.x - (4.5 - 2.5 * M)) < 1e-6 && Math.abs(turnEnd.z - 5) < 1e-6 && Math.abs(turnEnd.heading - Math.PI / 2) < 0.2, "a right turn leaves by the right-hand lane of the new street");

const signals = traffic.buildSignals(graph, town, () => 0.25);
test.assert(signals.size === 4, `every crossing has a signal (${signals.size})`);
let bothGreen = false, sawAmber = false;
for (let t = 0; t < 60; t += 0.25) {
  const ns = traffic.lightFor(signals, 4 * T + 4, 4, t), ew = traffic.lightFor(signals, 4 * T + 4, 2, t);
  if (ns === "green" && ew === "green") bothGreen = true;
  if (ns === "amber" || ew === "amber") sawAmber = true;
}
test.assert(!bothGreen && sawAmber, "north-south and east-west are never green together, with an amber between");

// The player as a box moved by hand: along row 4 at walking pace, so it
// never runs a light itself.
const walkTown = (seed, steps, speedKmh = 10, inspect = null) => {
  const street = traffic.createTraffic({ snapshot: town, world: townWorld, seed });
  const player = { x: 1.6, z: 4.5 + 2.5 * M, y: 0, heading: 0, speed: speedKmh * KMH, contact: null };
  let hash = 2166136261;
  for (let i = 0; i < steps; i += 1) {
    player.x = Math.min(14.4, player.x + player.speed * core.DT);
    traffic.stepTraffic(street, player, core.DT);
    if (inspect) inspect(street, player, i);
    for (const agent of [...street.cars, ...street.pedestrians]) {
      const text = `${agent.id}:${Math.round(agent.x * 1e5)}:${Math.round(agent.z * 1e5)}`;
      for (let k = 0; k < text.length; k += 1) hash = Math.imul(hash ^ text.charCodeAt(k), 16777619) >>> 0;
    }
  }
  return { street, player, digest: hash.toString(16) };
};
let redRun = 0, junctionEntries = 0;
const watched = new Map();
const runA = walkTown(11, 1800, 10, (street) => {
  street.cars.forEach((agent) => {
    const before = watched.get(agent.id);
    if (before !== undefined && before !== agent.tile && street.signals.has(agent.tile) && agent.kind !== "police") {
      junctionEntries += 1;
      if (traffic.lightFor(street.signals, agent.tile, agent.inDir, street.seconds) === "red") redRun += 1;
    }
    watched.set(agent.id, agent.tile);
  });
});
const runB = walkTown(11, 1800);
test.assert(runA.digest === runB.digest && runA.street.cars.length > 0 && runA.street.pedestrians.length > 0, `the street replays exactly from its seed (${runA.digest}, ${runA.street.cars.length} cars, ${runA.street.pedestrians.length} pedestrians)`);
test.assert(walkTown(12, 600).digest !== walkTown(11, 600).digest, "another seed is another street");
test.assert(junctionEntries > 3 && redRun === 0, `traffic never enters a crossing on red (${junctionEntries} entries)`);

// D3: a pedestrian on the car's line always steps out of the way.
const dodgeTown = traffic.createTraffic({ snapshot: town, world: townWorld, seed: 3 });
const runner = { x: 1.5, z: 4.5 + 2.5 * M, y: 0, heading: 0, speed: 60 * KMH, contact: null };
traffic.stepTraffic(dodgeTown, runner, core.DT);
dodgeTown.pedestrians = [0.3, 0.6, 0.9].map((ahead, i) => {
  const walker = { ...dodgeTown.pedestrians[0] || {}, id: 900 + i, dodge: null, speed: 1.2 * M, side: 1, tile: 4 * T + 6 + i * 2, inDir: 2, s: 0 };
  walker.path = traffic.tilePath(T, walker.tile, 2, 2, 6.6 * M);
  return Object.assign(walker, { x: runner.x + 3 + ahead * 3, z: runner.z + (i - 1) * 0.6 * M, y: 0, heading: Math.PI });
});
let closest = Infinity;
for (let i = 0; i < 240; i += 1) {
  runner.x = Math.min(14, runner.x + runner.speed * core.DT);
  traffic.stepTraffic(dodgeTown, runner, core.DT);
  dodgeTown.pedestrians.filter((p) => p.id >= 900).forEach((p) => {
    const ahead = Math.abs(p.x - runner.x) - 2.9 * M, side = Math.abs(p.z - runner.z) - 1.3 * M;
    closest = Math.min(closest, Math.max(ahead, side));
  });
}
test.assert(closest > 0, `pedestrians in the car's path at 60 km/h are never touched (closest ${(closest / M).toFixed(2)} m outside the car)`);

// Payphones and jobs: pull up beside a ringing phone and the job is yours;
// every kind can be finished, and every target is on the car's network.
const jobTown = traffic.createTraffic({ snapshot: town, world: townWorld, seed: 5 });
test.assert(jobTown.phones.length >= 2 && jobTown.phones.every((phone) => graph.isRoad(phone.tile)), `payphones stand beside the town's blocks (${jobTown.phones.length})`);
const seenKinds = new Set();
let paidJobs = 0;
const driver = { x: 0, z: 0, y: 0, heading: 0, speed: 0, contact: null };
for (let round = 0; round < 40 && seenKinds.size < 4; round += 1) {
  const phone = jobTown.phones[round % jobTown.phones.length];
  phone.ringingUntil = jobTown.seconds + 50;
  Object.assign(driver, { x: phone.x, z: phone.z, speed: 0 });
  traffic.stepTraffic(jobTown, driver, core.DT);
  const job = jobTown.job;
  if (!job) continue;
  seenKinds.add(job.kind);
  const before = jobTown.money;
  for (const target of job.targets) {
    test.assert(graph.component[target] === graph.component[phone.tile] && target !== phone.tile || job.kind === "stunt", `job ${job.id} (${job.kind}) targets a reachable road`);
    Object.assign(driver, { x: (target % T) + 0.5, z: Math.floor(target / T) + 0.5, speed: job.minKmh ? (job.minKmh + 5) * KMH : 0 });
    traffic.stepTraffic(jobTown, driver, core.DT);
  }
  if (jobTown.money > before && !jobTown.job) paidJobs += 1;
}
test.assert(seenKinds.size === 4 && paidJobs >= 4, `taxi, delivery, race and stunt jobs can all be taken and finished (${[...seenKinds].join(", ")}; ${paidJobs} paid)`);
const lateTown = traffic.createTraffic({ snapshot: town, world: townWorld, seed: 6 });
lateTown.phones[0].ringingUntil = 50;
traffic.stepTraffic(lateTown, { x: lateTown.phones[0].x, z: lateTown.phones[0].z, y: 0, heading: 0, speed: 0, contact: null }, core.DT);
const lateJob = lateTown.job;
while (lateTown.job && lateTown.seconds < 400) traffic.stepTraffic(lateTown, { x: 1.5, z: 11.5, y: 0, heading: 0, speed: 0, contact: null }, 0.5);
test.assert(Boolean(lateJob) && !lateTown.job && lateTown.reputation === -1, "a job not finished in time is lost, with a mark against the driver");

// Wanted: a red light raises it, police come, a stop beside them is a fine,
// and getting away long enough lets it fall.
const copTown = traffic.createTraffic({ snapshot: town, world: townWorld, seed: 8 });
copTown.graceUntil = 0; // past the first-pedal grace
// No patrols here (this town reads as low-crime), so the level is the offence's own.
copTown.ranges.crime = { low: 100, high: 200, even: false };
const speeder = { x: 3.4, z: 4.5 + 2.5 * M, y: 0, heading: 0, speed: 50 * KMH, contact: null };
let lit = "green";
for (let t = 0; t < 40 && lit !== "red"; t += 0.25) { lit = traffic.lightFor(copTown.signals, 4 * T + 4, 2, t); copTown.seconds = t; }
traffic.stepTraffic(copTown, speeder, core.DT);
speeder.x = 4.2;
traffic.stepTraffic(copTown, speeder, core.DT);
test.assert(copTown.wanted === 1, `entering a crossing on red at speed raises the wanted level (${copTown.wanted})`);
// P2: the same red run in front of a patrol car is worse.
const seenTown = traffic.createTraffic({ snapshot: town, world: townWorld, seed: 8 });
seenTown.graceUntil = 0; // past the first-pedal grace
seenTown.ranges.crime = { low: 100, high: 200, even: false };
seenTown.seconds = copTown.seconds;
const witness = { id: 501, kind: "police", x: 4.5, z: 3.6, y: 0, heading: Math.PI / 2, speed: 0, cruise: 0, tile: 3 * T + 4, inDir: 4, outDir: 4, s: 0, frame: "agent.service.police" };
witness.path = traffic.tilePath(T, witness.tile, 4, 4, 2.5 * M);
const seenCar = { x: 3.4, z: 4.5 + 2.5 * M, y: 0, heading: 0, speed: 50 * KMH, contact: null };
traffic.stepTraffic(seenTown, seenCar, core.DT);
seenTown.cars.push(witness);
seenCar.x = 4.2;
traffic.stepTraffic(seenTown, seenCar, core.DT);
test.assert(seenTown.wanted === 2, `a patrol car that sees the red run adds a level (${seenTown.wanted})`);
for (let i = 0; i < 120 && !copTown.cars.some((agent) => agent.kind === "police"); i += 1) traffic.stepTraffic(copTown, speeder, core.DT);
const cop = copTown.cars.find((agent) => agent.kind === "police");
test.assert(Boolean(cop), "a police car comes out");
Object.assign(speeder, { x: cop.x + 0.3, z: cop.z, speed: 0 });
const cash = copTown.money = 500;
for (let i = 0; i < 200 && copTown.wanted > 0; i += 1) { cop.speed = 0; cop.cruise = 0; Object.assign(speeder, { x: cop.x + 0.3, z: cop.z }); traffic.stepTraffic(copTown, speeder, core.DT); }
test.assert(copTown.wanted === 0 && copTown.money === cash - 100 && copTown.bustedCount === 1, `stopping beside the police is a fine and a clean slate (${copTown.money})`);
const runAway = traffic.createTraffic({ snapshot: town, world: townWorld, seed: 9 });
runAway.graceUntil = 0; // past the first-pedal grace
runAway.wanted = 2;
for (let i = 0; i < 80; i += 1) { traffic.stepTraffic(runAway, { x: 14.5, z: 11.5, y: 0, heading: 0, speed: 0, contact: null }, 0.5); runAway.cars = runAway.cars.filter((agent) => agent.kind !== "police"); }
test.assert(runAway.wanted === 0, "far from every police car long enough, the level falls to nothing");

// The other cars are solid: the player's car stops at one and knows which.
const parked = [{ id: 77, x: 3, z: 4, y: 0, heading: 0, halfLength: 2.9 * M, halfWidth: 1.3 * M }];
const rammer = core.createCar({ x: 1.5, z: 4, y: 0, heading: 0 });
let contact = null;
for (let i = 0; i < 300; i += 1) { core.stepCar(rammer, full, worldOf(8, [floor]), parked); if (rammer.contact) contact = rammer.contact; }
test.assert(rammer.x + 2 * core.CAR.halfLength <= 3 + 1e-6 && contact === 77, `the car stops at another car, never inside it, and says which (${contact})`);

// The shift: 17:00 to 20:00 in twelve minutes; the best ten scores kept.
const clockTown = traffic.createTraffic({ snapshot: town, world: townWorld, seed: 4, clock: traffic.createClock() });
for (let i = 0; i < 720; i += 1) traffic.stepTraffic(clockTown, { x: 1.5, z: 4.5, y: 0, heading: 0, speed: 0, contact: null }, 1);
test.assert(traffic.shiftOver(clockTown.clock) && Math.abs(clockTown.clock.seconds - 20 * 3600) < 1, "twelve minutes of driving is the three hours of the evening rush");
test.assert(traffic.rushFactor({ seconds: 18 * 3600 }) > traffic.rushFactor({ seconds: 17 * 3600 }) && traffic.rushFactor({ seconds: 18 * 3600 }) > traffic.rushFactor({ seconds: 20 * 3600 }), "the streets are busiest at six");
const board = Array.from({ length: 12 }, (_, i) => ({ score: i * 10 })).reduce((list, entry) => traffic.addHighScore(list, entry), []);
test.assert(board.length === 10 && board[0].score === 110 && board[9].score === 20, "the high-score board keeps the best ten, best first");

// --- P2: the city's state on the street --------------------------------------------
// A town with two halves: the west zoned residential, crime high, land cheap;
// the east commercial, crime low, land dear. Police, fire and a hospital;
// a congested stretch of road. Effects are judged against the town itself.
const districtTown = {
  ...town,
  zone: townLayer((x, y) => (!isTownRoad(x, y) && x >= 1 && x <= 14 && y >= 1 && y <= 14 ? (x < 8 ? 1 : 2) : 0)),
  density: townLayer(() => 2),
  crime: townLayer((x) => (x < 8 ? 140 : 12)),
  landValue: townLayer((x) => (x < 8 ? 30 : 170)),
  policeCovered: townLayer(() => 1),
  fireRisk: townLayer((x, y) => (x === 12 && y === 9 ? 200 : 20)),
  fireCovered: townLayer(() => 0),
  healthCovered: townLayer(() => 1),
  congested: townLayer((x, y) => (y === 11 && x >= 6 && x <= 9 ? 1 : 0)),
  facilities: [{ kind: "police", x: 2, y: 2 }, { kind: "fire", x: 13, y: 13 }, { kind: "hospital", x: 2, y: 13 }],
};
const evenRange = traffic.createTraffic({ snapshot: town, world: townWorld, seed: 1 }).ranges.crime;
test.assert(evenRange.even, "a town whose blocks do not differ reads as even");
const patrolsNear = (x, z) => {
  const t2 = traffic.createTraffic({ snapshot: districtTown, world: townWorld, seed: 21 });
  const parked = { x, z, y: 0, heading: 0, speed: 0, contact: null };
  let police = 0;
  for (let i = 0; i < 900; i += 1) { traffic.stepTraffic(t2, parked, core.DT); police += t2.cars.filter((agent) => agent.kind === "police").length; }
  return police / 900;
};
const westPatrols = patrolsNear(2.5, 7.5), eastPatrols = patrolsNear(13.5, 7.5);
test.assert(westPatrols > eastPatrols + 0.5, `patrol cars cruise where this city's crime is high (west ${westPatrols.toFixed(2)} vs east ${eastPatrols.toFixed(2)})`);
const jamTown = traffic.createTraffic({ snapshot: districtTown, world: townWorld, seed: 22 });
const jamWatch = { x: 7.5, z: 11.5, y: 0, heading: 0, speed: 0, contact: null };
const jamSpeeds = [], freeSpeeds = [];
for (let i = 0; i < 2400; i += 1) {
  traffic.stepTraffic(jamTown, jamWatch, core.DT);
  jamTown.cars.filter((agent) => agent.kind !== "police").forEach((agent) => {
    if (districtTown.congested[agent.tile]) jamSpeeds.push(agent.speed); else if (!jamTown.signals.has(agent.tile)) freeSpeeds.push(agent.speed);
  });
}
// How fast traffic gets going on each kind of tile: the ninetieth percentile.
const p90 = (list) => { const sorted = [...list].sort((a, b) => a - b); return sorted[Math.floor(sorted.length * 0.9)] || 0; };
test.assert(jamSpeeds.length > 0 && freeSpeeds.length > 0 && p90(jamSpeeds) < 0.6 * p90(freeSpeeds), `cars crawl on the tiles the city counts as congested (${(p90(jamSpeeds) / KMH).toFixed(0)} vs ${(p90(freeSpeeds) / KMH).toFixed(0)} km/h)`);

// Emergency jobs come from the city's own stations, and only when it has them.
const fireTown = traffic.createTraffic({ snapshot: districtTown, world: townWorld, seed: 23 });
const kindsOffered = new Set();
let emergency = null;
for (let i = 0; i < 60; i += 1) {
  fireTown.jobCount = i;
  const job = traffic.makeJob(fireTown, fireTown.phones[i % fireTown.phones.length]);
  if (job) kindsOffered.add(job.kind);
  if (job && (job.kind === "fire" || job.kind === "ambulance") && !emergency) emergency = job;
}
test.assert(kindsOffered.has("fire") && kindsOffered.has("ambulance"), `a town with a fire station and a hospital offers fire and ambulance jobs (${[...kindsOffered].join(", ")})`);
test.assert(emergency && emergency.targets.length === 2 && emergency.vehicle && emergency.vehicleFrom === 1
  && emergency.targets[0] === (emergency.kind === "fire" ? fireTown.stations.fire : fireTown.stations.hospital), "an emergency job runs to the station for the vehicle, then to the call");
const fireJob = [...Array(80).keys()].map((i) => { fireTown.jobCount = i; return traffic.makeJob(fireTown, fireTown.phones[0]); }).find((job) => job && job.kind === "fire");
test.assert(fireJob && fireJob.targets[1] === 9 * T + 11, "a fire call goes to the block most at risk of fire");
// A real fire comes first: the call goes to the road beside a block the
// city has burning (Basin J2: only what the city really has).
const burningTown = { ...districtTown, blaze: townLayer((x, y) => (x === 6 && y === 12 ? 2 : 0)) };
const realFireTown = traffic.createTraffic({ snapshot: burningTown, world: townWorld, seed: 23 });
const realFire = [...Array(80).keys()].map((i) => { realFireTown.jobCount = i; return traffic.makeJob(realFireTown, realFireTown.phones[0]); }).find((job) => job && job.kind === "fire");
const fireCall = realFire && realFire.targets[1];
test.assert(realFire && realFire.realFire && Math.abs((fireCall % T) - 6) + Math.abs(Math.floor(fireCall / T) - 12) <= 2, `a fire job goes to the block the city has burning (${fireCall % T},${Math.floor(fireCall / T)})`);
test.assert(traffic.burningTiles(burningTown).join() === String(12 * T + 6), "burning means blaze 1 to 4 (rubble and floods are not fires)");
const plainKinds = new Set([...Array(40).keys()].map((i) => { const t3 = traffic.createTraffic({ snapshot: town, world: townWorld, seed: 30 + i }); return traffic.makeJob(t3, t3.phones[0])?.kind; }));
test.assert(!plainKinds.has("fire") && !plainKinds.has("ambulance"), "a town without them never offers emergency jobs");
// Reputation carries over: a bad name gets only risky jobs, a good one more lines.
const shady = traffic.createTraffic({ snapshot: districtTown, world: townWorld, seed: 24, reputation: -4 });
const shadyKinds = new Set([...Array(20).keys()].map((i) => { shady.jobCount = i; return traffic.makeJob(shady, shady.phones[i % shady.phones.length])?.kind; }));
test.assert([...shadyKinds].every((kind) => kind === "race" || kind === "stunt"), `a driver with a bad name is offered only the risky jobs (${[...shadyKinds].join(", ")})`);
const ringingWith = (reputation) => {
  const t4 = traffic.createTraffic({ snapshot: districtTown, world: townWorld, seed: 25, reputation });
  for (let i = 0; i < 600; i += 1) traffic.stepTraffic(t4, { x: 1.5, z: 4.5, y: 0, heading: 0, speed: 20 * KMH, contact: null }, 0.1);
  return t4.phones.filter((phone) => phone.ringingUntil > t4.seconds).length;
};
test.assert(ringingWith(8) > ringingWith(0), "a good name rings more phones at once");

// --- P3: the railway ------------------------------------------------------------------
// Bonsai City's own track and stations (spec §6, without Rootline's line
// identities): one train shuttles each line on a pure timetable; level
// crossings close; stations are where a stopped car may ride.
vm.runInContext(read("app/features/joyride-rail.js"), context);
const rail = context.window.AISystem6JoyrideRail;
const railSource = read("app/features/joyride-rail.js");
for (const needle of ["Math.random", "Date.now", "performance.now", "document.", "requestAnimationFrame", "setTimeout", "localStorage"]) {
  test.assertNotIncludes(railSource, needle, `the railway stays headless (${needle})`);
}
const railTown = {
  ...town,
  // A railway along row 8, over both north-south streets on the level; a
  // subway under row 7 between two subway stations.
  rail: townLayer((x, y) => (y === 8 && x >= 1 && x <= 14 ? 1 : 0)),
  subway: townLayer((x, y) => (y === 7 && x >= 5 && x <= 10 ? 1 : 0)),
  facilities: [
    { kind: "police", x: 2, y: 2 },
    { kind: "station", x: 1, y: 9, w: 2, h: 2 },
    { kind: "station", x: 13, y: 9, w: 2, h: 2 },
    { kind: "subway-station", x: 5, y: 6 },
    { kind: "subway-station", x: 10, y: 6 },
  ],
};
const network = rail.buildRailNetwork(railTown);
const railLine = network.lines.find((line) => line.kind === "rail");
const subwayLine = network.lines.find((line) => line.kind === "subway");
test.assert(network.lines.length === 2 && network.stations.length === 4, `the town has a railway and a subway, four stations (${network.lines.length}, ${network.stations.length})`);
test.assert([...network.crossings.keys()].sort((a, b) => a - b).join() === [8 * T + 4, 8 * T + 11].join(), "a road over the railway is a level crossing; the subway crosses nothing");
test.assert(railLine.stops.length === 2 && railLine.path.length >= 12 && network.stations.every((station) => station.compass && station.line), "the railway runs from one station to the other, and every station has a line and a direction for its name");
let trainOk = true, sawDwell = new Set(), lastPos = rail.trainAt(railLine, 0).pos;
for (let t = 0; t <= railLine.period * 2; t += 0.1) {
  const train = rail.trainAt(railLine, t);
  if (train.pos < -1e-9 || train.pos > railLine.path.length - 1 + 1e-9 || Math.abs(train.pos - lastPos) > 0.2) trainOk = false;
  if (train.station) sawDwell.add(train.station);
  lastPos = train.pos;
}
test.assert(trainOk && sawDwell.size === 2, "the train moves smoothly along the track, never off it, and stands at both stations");
test.assert(JSON.stringify(rail.trainAt(railLine, 123.4)) === JSON.stringify(rail.trainAt(railLine, 123.4 + railLine.period)), "the timetable repeats every round trip: where the train is depends only on the time");
let closedOk = true, sawClosed = false, sawOpen = false;
for (let t = 0; t <= railLine.period; t += 0.25) {
  const closed = rail.crossingClosed(network, 8 * T + 4, t);
  const index = network.crossings.get(8 * T + 4).index;
  if (closed !== Math.abs(rail.trainAt(railLine, t).pos - index) < rail.CROSSING_REACH) closedOk = false;
  if (closed) sawClosed = true; else sawOpen = true;
}
test.assert(closedOk && sawClosed && sawOpen, "a level crossing is closed exactly while the train is near it, and open the rest of the time");
const [westStation, eastStation] = network.stations.filter((station) => station.kind === "rail").sort((a, b) => a.x - b.x);
const there = rail.rideTimes(network, westStation.id, eastStation.id, 5);
const back = rail.rideTimes(network, eastStation.id, westStation.id, 5);
test.assert(there && back && there.wait >= 0 && there.ride > 0 && there.arrive > there.depart && back.ride > 0 && Math.abs(there.ride - back.ride) < 1e-6,
  "a ride is the next departure and the arrival at the other end, the same length either way");
test.assert(rail.rideTimes(network, westStation.id, network.stations.find((station) => station.kind === "subway").id, 5) === null && rail.rideTimes(network, westStation.id, westStation.id, 5) === null,
  "no ride between lines, or to the station you are at");
test.assert(rail.nextDeparture(network, westStation.id, there.depart) === there.depart && rail.nextDeparture(network, westStation.id, there.depart + 0.01) > there.depart, "a departure is the moment the train leaves");
test.assert(rail.trainCars(network, 10).filter((car) => car.kind === "rail").length === 2, "a train is a locomotive and a coach");
const bareNetwork = rail.buildRailNetwork({ ...railTown, facilities: [], subway: townLayer(() => 0) });
test.assert(bareNetwork.lines.length === 1 && bareNetwork.stations.length === 0 && bareNetwork.lines[0].path.length === 14 && bareNetwork.crossings.size === 2,
  "a railway without stations (as OpenStreetMap imports lay it) still runs a train end to end, and its crossings still close");

// Basin J4: a line laid from a Rootline plan (the transitLines sidecar)
// runs as planned -- its own path, stations in its order, with their names;
// track it does not cover stays the city's own line.
const hezhouSidecar = { version: 1, lines: [{ id: "L1", name: { zh: "1 号线", en: "Line 1" }, color: 2,
  stations: [{ x: 1, y: 9, kind: "station", name: { zh: "梅坪站", en: "Meiping" } }, { x: 13, y: 9, kind: "station", name: { zh: "桐坊站", en: "Tongfang" } }],
  tiles: Array.from({ length: 14 }, (_, i) => [1 + i, 8]).flat() }] };
const plannedNetwork = rail.buildRailNetwork(railTown, hezhouSidecar);
const plannedLine = plannedNetwork.lines.find((line) => line.id === "plan-L1");
test.assert(plannedLine && plannedLine.name.en === "Line 1" && plannedLine.path.length === 14 && plannedLine.stops.length === 2,
  "a planned line keeps its name and its own path through its stations");
test.assert(plannedNetwork.stations.filter((station) => station.line === "plan-L1").map((station) => station.name.zh).join() === "梅坪站,桐坊站", "its stations carry the names the plan gave them");
test.assert(plannedNetwork.lines.filter((line) => line.kind === "rail").length === 1 && plannedNetwork.lines.some((line) => line.kind === "subway"),
  "the railway it covers is not run twice; the subway it does not touch still runs as the city's own line");
test.assert(rail.rideTimes(plannedNetwork, "rail:1,9", "rail:13,9", 0)?.ride > 0, "and one can ride it");
// Buses and BRT (Aaron, 2026-10-02: Rootline plans buses and BRT too, and
// all three games show them). A loop bus round the town's square and a BRT
// shuttling the south street on its own lane.
const loopTiles = [];
for (let x = 4; x <= 11; x += 1) loopTiles.push(x, 4);
for (let y = 5; y <= 11; y += 1) loopTiles.push(11, y);
for (let x = 10; x >= 4; x -= 1) loopTiles.push(x, 11);
for (let y = 10; y >= 5; y -= 1) loopTiles.push(4, y);
const brtTiles = Array.from({ length: 14 }, (_, i) => [1 + i, 11]).flat();
const busPlan = { version: 1, lines: [
  { id: "3", mode: "bus", loop: true, name: { zh: "3 路", en: "Route 3" }, color: 1, headway: 4, tiles: loopTiles, stops: [{ x: 7, y: 4, name: { zh: "梅坪", en: "Meiping" } }, { x: 11, y: 8, name: { zh: "桐坊", en: "Tongfang" } }, { x: 7, y: 11, name: { zh: "苇塘", en: "Weitang" } }] },
  { id: "B1", mode: "brt", loop: false, name: { zh: "快线 1", en: "BRT 1" }, color: 3, tiles: brtTiles, stops: [{ x: 2, y: 11 }, { x: 13, y: 11 }] },
] };
const busTown = { ...town, congested: townLayer((x, y) => (y === 11 && x >= 5 && x <= 10 ? 1 : 0)), busLane: townLayer((x, y) => (y === 11 && x >= 5 && x <= 10 ? 1 : 0)) };
const busNetwork = rail.buildRailNetwork(busTown, busPlan);
const loopLine = busNetwork.lines.find((line) => line.id === "bus-3");
const brtLine = busNetwork.lines.find((line) => line.id === "brt-B1");
test.assert(loopLine && loopLine.loop && loopLine.stops.length === 3 && loopLine.vehicles >= 2 && brtLine && !brtLine.loop, `a loop bus with its stops and several vehicles a headway apart, and a BRT shuttle (${loopLine?.vehicles} buses)`);
let busesOk = true, lastBus = null;
for (let t = 0; t < loopLine.period; t += 0.1) {
  const bus = rail.buses(busNetwork, t).find((item) => item.line === "bus-3" && item.vehicle === 0);
  const tile = Math.floor(bus.z) * T + Math.floor(bus.x);
  if (!isTownRoad(Math.floor(bus.x), Math.floor(bus.z)) || (lastBus && Math.hypot(bus.x - lastBus.x, bus.z - lastBus.z) > 0.2)) busesOk = false;
  lastBus = bus;
}
test.assert(busesOk, "a bus keeps to the road round its loop, never jumping");
const busRide = rail.rideTimes(busNetwork, "bus-3:7,4", "bus-3:7,11", 3);
test.assert(busRide && busRide.ride > 0 && busRide.wait >= 0, "one can ride a bus from stop to stop");
const unlaned = rail.buildRailNetwork({ ...busTown, busLane: null }, busPlan).lines.find((line) => line.id === "brt-B1");
test.assert(brtLine.period < unlaned.period, `BRT on its own lane is not held up by the jam that slows it without one (${brtLine.period.toFixed(0)} s vs ${unlaned.period.toFixed(0)} s)`);
const laneStreet = traffic.createTraffic({ snapshot: busTown, world: townWorld, seed: 81, transit: busPlan });
let carsInLane = 0;
for (let i = 0; i < 3000; i += 1) {
  traffic.stepTraffic(laneStreet, { x: 4.5 - 2.5 * M, z: 2.5, y: 0, heading: Math.PI / 2, speed: 0, contact: null }, core.DT);
  laneStreet.cars.forEach((agent) => { if (agent.kind !== "police" && busTown.busLane[Math.floor(agent.z) * T + Math.floor(agent.x)]) carsInLane += 1; });
}
test.assert(carsInLane === 0, `cars keep out of the BRT lane (${carsInLane} car-steps in it)`);
const laneRunner = traffic.createTraffic({ snapshot: busTown, world: townWorld, seed: 82, transit: busPlan });
laneRunner.graceUntil = 0;
const intoLane = { x: 4.6, z: 11.5 + 2.5 * M, y: 0, heading: 0, speed: 40 * KMH, contact: null };
const laneReasons = [];
for (let i = 0; i < 150; i += 1) {
  intoLane.x += intoLane.speed * core.DT;
  traffic.stepTraffic(laneRunner, intoLane, core.DT);
  laneRunner.events.filter((event) => event.type === "camera" || event.type === "wanted").forEach((event) => laneReasons.push(event.type === "camera" ? "camera" : event.why));
}
test.assert(laneReasons.includes("camera"), `driving into the BRT lane is filmed (${laneReasons.join(", ")})`);
const nearBus = rail.buses(laneRunner.rail, laneRunner.seconds)[0];
test.assert(traffic.obstaclesNear(laneRunner, { x: nearBus.x, z: nearBus.z + 0.2 }).some((box) => String(box.id).startsWith("bus:")), "a bus is solid to the player's car");
test.assert(laneRunner.phones.some((phone) => String(phone.station || "").startsWith("brt-")), "a BRT stop has a payphone on its pavement");
test.assert(!laneRunner.phones.some((phone) => phone.station === "bus-3:11,8"), "a loop bus does not put a phone on an intermediate stop");
test.assert(laneRunner.phones.filter((phone) => phone.station && /^(bus|brt)-/.test(phone.station)).length <= 4, "transit phones stay within four");
// On the street: cars never meet a train; the player is stopped by one and
// booked for running a closed crossing.
const railStreet = traffic.createTraffic({ snapshot: railTown, world: townWorld, seed: 41 });
test.assert(railStreet.rail && railStreet.rail.lines.length === 2, "the street reads the railway when the module is there");
let metTrain = false, waited = false;
for (let i = 0; i < 4000; i += 1) {
  traffic.stepTraffic(railStreet, { x: 4.5 - 2.5 * M, z: 2.5, y: 0, heading: Math.PI / 2, speed: 0, contact: null }, core.DT);
  const trainCars = rail.trainCars(railStreet.rail, railStreet.seconds).filter((car) => car.kind === "rail");
  railStreet.cars.forEach((agent) => {
    if (trainCars.some((car) => Math.abs(car.x - agent.x) < 0.25 && Math.abs(car.z - agent.z) < 0.2)) metTrain = true;
    const tile = Math.floor(agent.z) * T + Math.floor(agent.x);
    const next = tile + (agent.outDir === 4 ? T : agent.outDir === 1 ? -T : agent.outDir === 2 ? 1 : -1);
    if (agent.speed < 0.5 * KMH && traffic.crossingClosed(railStreet, next)) waited = true;
  });
}
test.assert(!metTrain, "no car is ever where the train is");
test.assert(waited, "a car waits at a closed crossing");
const crossingIndex = network.crossings.get(8 * T + 4).index;
let closeAt = 0;
for (let t = 0; t < railLine.period; t += 0.05) if (Math.abs(rail.trainAt(railLine, t).pos - crossingIndex) < 0.6 && rail.trainAt(railLine, t).dir > 0) { closeAt = t; break; }
const runCrossing = traffic.createTraffic({ snapshot: railTown, world: townWorld, seed: 42 });
// The first pedal is free: a car fresh on the road is not fined for five seconds.
const fresh = traffic.createTraffic({ snapshot: railTown, world: townWorld, seed: 42 });
test.assert(fresh.graceUntil === 5, "a new street fines nobody for its first five seconds");
const ownCurve = traffic.rushFactor({ seconds: 8 * 3600 });
context.window.AISystem6PotWorld = { hours: { roadTraffic: (hour) => (hour === 8 ? 1 : 0.5) } };
const sharedCurve = traffic.rushFactor({ seconds: 8 * 3600 });
delete context.window.AISystem6PotWorld;
test.assert(Math.abs(sharedCurve - 1.04) < 1e-9 && ownCurve < 0.6, `with the shared core loaded the street follows its road-traffic curve (8:00 is a peak: ${sharedCurve} vs its own ${ownCurve.toFixed(2)})`);
runCrossing.seconds = closeAt - 1;
const crossingRunner = { x: 4.5 - 2.5 * M, z: 7.3, y: 0, heading: Math.PI / 2, speed: 40 * KMH, contact: null };
const crossingReasons = [];
for (let i = 0; i < 150; i += 1) {
  crossingRunner.z += crossingRunner.speed * core.DT;
  traffic.stepTraffic(runCrossing, crossingRunner, core.DT);
  runCrossing.events.filter((event) => event.type === "wanted").forEach((event) => crossingReasons.push(event.why));
}
test.assert(crossingReasons.includes("crossing"), `running a closed crossing raises the wanted level (${crossingReasons.join(", ")})`);
const solid = traffic.createTraffic({ snapshot: railTown, world: townWorld, seed: 43 });
solid.seconds = closeAt;
const besideTrain = rail.trainCars(solid.rail, solid.seconds).find((car) => car.kind === "rail" && car.car === 0);
test.assert(traffic.obstaclesNear(solid, { x: besideTrain.x, z: besideTrain.z + 0.3 }).some((box) => String(box.id).startsWith("train:")), "the train is solid to the player's car");
test.assert(!traffic.obstaclesNear(solid, { x: 7.5, z: 7.5 }).some((box) => String(box.id).startsWith("train:subway")), "the subway train is underground: not solid on the street");

// Riding: stopped at a station, the car rides to another; time passes, the
// police lose the trail, the street is left behind.
const rider = traffic.createTraffic({ snapshot: railTown, world: townWorld, seed: 44, clock: traffic.createClock() });
const atWest = { x: 4.5 - 2.5 * M, z: 9.5, y: 0, heading: Math.PI / 2, speed: 0, contact: null };
test.assert(traffic.stationHere(rider, atWest)?.id === westStation.id, "a car stopped by the station is at the station");
test.assert(traffic.stationHere(rider, { ...atWest, z: 2.5 }) === null, "away from it, it is not");
rider.wanted = 3;
rider.cars.push({ kind: "police", x: atWest.x, z: atWest.z + 1.2 });
test.assert(traffic.rideTrain(rider, atWest, eastStation.id).reason === "police-close", "with a police car right there, no getting into the station");
rider.cars = [{ kind: "police", x: 12.5, z: 2.5 }];
test.assert(traffic.rideTrain(rider, { ...atWest, speed: 20 * KMH }, eastStation.id).reason === "moving", "the car has to stop first");
const before = { seconds: rider.seconds, clock: rider.clock.seconds };
const expected = rail.rideTimes(rider.rail, westStation.id, eastStation.id, rider.seconds);
const ride = traffic.rideTrain(rider, atWest, eastStation.id);
test.assert(ride.ok && ride.lost === 3 && rider.wanted === 0 && rider.cars.length === 0, "a ride to another station shakes off the police");
test.assert(Math.abs(rider.seconds - expected.arrive) < 1e-9 && Math.abs(rider.clock.seconds - before.clock - (expected.arrive - before.seconds) * rider.clock.scale) < 1e-6,
  "the wait and the ride pass on the street's clock and the shift's");
test.assert(rider.events.some((event) => event.type === "rode" && event.to === eastStation.id) && rider.events.some((event) => event.type === "wanted" && event.why === "rode-away"), "the ride and the lost chase are reported");
// Catching a train: a job whose deadline is a real departure from a real station.
const trainJob = [...Array(60).keys()].map((i) => { rider.jobCount = i; return traffic.makeJob(rider, rider.phones[i % rider.phones.length]); }).find((job) => job && job.kind === "train");
const jobStation = trainJob && rider.rail.stations.find((station) => station.id === trainJob.train.station);
test.assert(trainJob && jobStation && trainJob.deadline === trainJob.train.depart && rail.nextDeparture(rider.rail, jobStation.id, trainJob.deadline) === trainJob.deadline
  && trainJob.targets[0] === traffic.stationRoad(rider, jobStation), "a catch-the-train job runs to a station's road before one of its real departures");
// Stations have a payphone at the door, and a fare off the train is a taxi job.
const stationPhones = rider.phones.filter((phone) => phone.station);
test.assert(stationPhones.length === rider.rail.stations.filter((station) => traffic.stationRoad(rider, station) >= 0).length, `every reachable station has a payphone at its door (${stationPhones.length})`);
rider.jobCount = 3;
test.assert(stationPhones.every((phone) => traffic.makeJob(rider, phone)?.kind === "taxi"), "a call from a station phone is a taxi fare");
// D4: the diary behind the letter to the mayor. A car crawling on a
// congested street is a jam on that tile; offences and missed jobs count.
const jammed = { ...districtTown, congested: townLayer((x, y) => (y === 4 && x >= 6 && x <= 9 ? 1 : 0)) };
const diaryTown = traffic.createTraffic({ snapshot: jammed, world: townWorld, seed: 70 });
const crawler = { x: 7.5, z: 4.5 + 2.5 * M, y: 0, heading: 0, speed: 3 * KMH, contact: null };
for (let i = 0; i < 1800; i += 1) traffic.stepTraffic(diaryTown, crawler, core.DT);
const facts = traffic.letterFacts(diaryTown);
test.assert(facts.worstJam && facts.worstJam.tile === 4 * T + 7 && facts.worstJam.minutes >= 0.4 && facts.jamMinutes >= facts.worstJam.minutes,
  `the worst jam is the tile the car crawled on, timed (${JSON.stringify(facts.worstJam)})`);
test.assert(["r", "c", "i", "none"].includes(facts.worstJam.zone) && typeof facts.worstJam.compass === "string", "and it is placed by the zone beside it and its side of town");
const quiet = traffic.letterFacts(traffic.createTraffic({ snapshot: jammed, world: townWorld, seed: 71 }));
test.assert(quiet.worstJam === null && quiet.jamMinutes === 0 && quiet.offences === 0, "a night without jams has no jam to write about");
test.assert(facts.list.some((fact) => fact.key === "jam" && fact.x === 7 && fact.y === 4 && fact.n === facts.worstJam.minutes) && quiet.list.length === 0,
  "the record lists neutral facts, each traceable to a tile or a count");
test.assertIncludes(read("app/features/joyride.js"), 'if (typeof world?.postLetter === "function") posted = Boolean(world.postLetter(letter));', "the letter goes to the shared city core when it is loaded");
test.assertIncludes(read("app/features/joyride.js"), 'win.querySelector("[data-joyride-letter-send]").addEventListener("click", () => sendLetter());', "and only when the player sends it");
test.assertIncludes(read("app/features/joyride.js"), "const ownWords = (form.querySelector(\"[data-joyride-letter-words]\")?.value || \"\").slice(0, 140).trim() || null;", "the player's own line is kept as typed (up to 140 characters)");
for (const banned of ["我在城里开了", "让人不太放心", "I drove the evening rush", "do not feel safe"]) {
  test.assertNotIncludes(read("app/data/translations-zh.js") + read("app/data/translations-en.js"), banned, `no letter sentence speaks in the driver's voice (${banned})`);
}
test.assertIncludes(read("app/features/joyride.js"), 'const LETTERS_KEY = "ai-system6-joyride-letters";', "and waits in Joyride's own queue until then");
const railless = new Set([...Array(30).keys()].map((i) => { const t5 = traffic.createTraffic({ snapshot: town, world: townWorld, seed: 60 + i }); return traffic.makeJob(t5, t5.phones[0])?.kind; }));
test.assert(!railless.has("train"), "a town without a railway never offers one");

// The shell's side of P1: the scores in localStorage (D7), the synthesized
// stations (D5), the shift and the board in the menus, the dashboard.
test.assertIncludes(shellSource, 'const SCORES_KEY = "ai-system6-joyride-scores";', "high scores live in localStorage (D7)");
test.assertIncludes(shellSource, 'const RADIO_STATIONS = Object.freeze([null, "bonsai-fm", "night-line", "static-am"]);', "the radio is the three synthesized stations and off (D5)");
test.assertIncludes(shellSource, 'item("joyride-start-shift", "joyride_start_shift")', "the evening rush starts from the File menu");
test.assertIncludes(shellSource, "street().obstaclesNear(traffic, game.car)", "the other cars are solid to the player's car");
test.assertIncludes(shellSource, "data-joyride-wanted", "the dashboard shows the wanted level");
test.assertIncludes(read("app/core/config.js"), '"app/features/joyride-traffic.js",\n  "app/features/joyride-radio.js",\n  "app/features/joyride.js"', "the traffic core and the radio load before the shell");
test.assertIncludes(read("app/core/config.js"), '"app/features/joyride-rail.js",\n  "app/features/joyride-bus.js",\n  "app/features/joyride-traffic.js"', "the railway and the bus module load before the traffic core");
test.assertIncludes(shellSource, 'item("joyride-ride-train", "joyride_ride_train")', "P3: riding the train is in the Drive menu");
test.assertIncludes(shellSource, 'event.code === "Enter" || event.code === "NumpadEnter"', "P3: Return at a station opens the ride");
test.assertIncludes(shellSource, 'data-joyride-action="ride"', "P3: a touch button rides the train on a phone");
test.assertIncludes(shellSource, "street().streetObjects(traffic, car)", "P3: trains near the car are drawn");
test.assertIncludes(shellSource, "street().rideTrain(traffic, game.car, toId)", "P3: the ride itself is the headless core's");
// The photograph (Aaron, 2026-10-02): the Picture Album holds the picture,
// the File Floppy a text card; the credit is drawn into the picture.
test.assertIncludes(shellSource, 'buildImageAttachments([new File([blob], name, { type: "image/png" })], { projectId: project.id, surface: "joyride"', "P3: a photo goes to the project's Picture Album, in the store ClioPaint uses");
test.assertIncludes(shellSource, 'insertFilesIntoFileFloppy([card], { source: "joyride", openAfter: "" })', "P3: and a text card goes on the File Floppy");
test.assertIncludes(shellSource, "ctx.fillText(caption,", "P3: the caption (city, hour, any OpenStreetMap credit) is drawn into the picture");
test.assertIncludes(shellSource, 'game.town.osm ? `- ${t("joyride_photo_card_osm")}`', "P3: a real place's card carries the ODbL credit");
test.assertIncludes(shellSource, 'item("joyride-take-photo", "joyride_take_photo")', "P3: the shutter is in the File menu (and P)");
test.assertNotIncludes(shellSource, "createObjectStore", "P3: no new store for photos");

// --- avenues: a centre-median BRT and the slow traffic beside it (Aaron's brief, Yichang and Guangzhou) ---
// The town's square with an avenue laid across it: row 7 the westbound
// half, row 8 the eastbound, the median between them, crossing both
// north-south streets. A BRT runs in the median's busway with an island
// stop at x = 7 and turns back at both ends; an ordinary bus runs the south
// street and stops at the kerb.
const tileAt = (x, y) => y * T + x;
const isAvenueTownRoad = (x, y) => isTownRoad(x, y) || ((y === 7 || y === 8) && x >= 1 && x <= 14);
const avenueHalves = townLayer((x, y) => (x >= 1 && x <= 14 ? (y === 7 ? 8 : y === 8 ? 2 : 0) : 0));
const avenueTown = { ...town, road: townLayer(isAvenueTownRoad), traffic: townLayer((x, y) => (isAvenueTownRoad(x, y) ? 90 : 0)), avenue: avenueHalves };
const avenuePlan = { version: 1, lines: [
  { id: "B2", mode: "brt", tiles: Array.from({ length: 14 }, (_, i) => [1 + i, 7]).flat(), stops: [{ x: 7, y: 7 }] },
  { id: "7", mode: "bus", tiles: Array.from({ length: 14 }, (_, i) => [1 + i, 11]).flat(), stops: [{ x: 7, y: 11 }] },
] };
const brokenHalves = Uint8Array.from(avenueHalves);
brokenHalves[tileAt(9, 8)] = 8; // runs the same way as the half beside it: no pair at x = 9
brokenHalves[tileAt(6, 4)] = 2; // a half on the plain street with no road to its left
const checkedHalves = core.avenueLayer({ size: T, road: avenueTown.road, avenue: brokenHalves });
test.assert(checkedHalves[tileAt(8, 7)] === 8 && checkedHalves[tileAt(8, 8)] === 2, "an avenue half answered by its partner keeps its way");
test.assert(checkedHalves[tileAt(9, 7)] === 0 && checkedHalves[tileAt(9, 8)] === 0 && checkedHalves[tileAt(6, 4)] === 0,
  "a half whose partner is missing or runs the wrong way is an ordinary road");
test.assert(core.avenueLayer({ size: T, road: avenueTown.road, avenue: townLayer((x, y) => (x === 6 && y === 4 ? 2 : 0)) }) === null, "a layer without one answered pair is no avenue at all");
const avenueStreet = core.streetLayers(avenueTown, avenuePlan);
const rowOf = (layer, y) => Array.from({ length: T }, (_, x) => layer[tileAt(x, y)]).join("");
const layerSum = (layer) => layer.reduce((n, value) => n + value, 0);
test.assert(rowOf(avenueStreet.busLane, 7) === "0111111111111110" && rowOf(avenueStreet.busLane, 8) === "0111111111111110" && layerSum(avenueStreet.busLane) === 28,
  `a BRT planned down one half has its busway on both halves of the avenue, and nowhere else (${rowOf(avenueStreet.busLane, 7)} / ${rowOf(avenueStreet.busLane, 8)})`);
test.assert(avenueStreet.busStop[tileAt(7, 7)] === 2 && avenueStreet.busStop[tileAt(7, 8)] === 2 && avenueStreet.busStop[tileAt(7, 11)] === 1 && layerSum(avenueStreet.busStop) === 5,
  "a BRT stop on the avenue is an island platform on both halves (2); an ordinary bus stops at the kerb (1)");
test.assert(!("busLane" in avenueTown) && !("busStop" in avenueTown) && avenueTown.avenue === avenueHalves, "the street's layers are its own copy: the snapshot is not written");

// One way each half, the median closed between crossings.
const avenueGraph = traffic.buildRoadGraph(avenueStreet);
test.assert(!traffic.canGo(avenueGraph, tileAt(6, 7), 2) && traffic.canGo(avenueGraph, tileAt(6, 7), 8) && !traffic.canGo(avenueGraph, tileAt(6, 8), 8) && traffic.canGo(avenueGraph, tileAt(6, 8), 2),
  "each half of the avenue is one way: west on the north half, east on the south");
test.assert(!traffic.canGo(avenueGraph, tileAt(6, 7), 4) && !traffic.canGo(avenueGraph, tileAt(6, 8), 1) && !traffic.canGo(avenueGraph, tileAt(12, 8), 1),
  "the median cannot be crossed between crossings");
test.assert(traffic.canGo(avenueGraph, tileAt(4, 7), 4) && traffic.canGo(avenueGraph, tileAt(11, 8), 1) && traffic.canGo(avenueGraph, tileAt(1, 7), 4) && traffic.canGo(avenueGraph, tileAt(14, 8), 1),
  "it opens at a crossing, and at the avenue's ends to turn back");
test.assert(!traffic.canGo(avenueGraph, tileAt(4, 7), 2) && !traffic.canGo(avenueGraph, tileAt(4, 8), 8) && traffic.canGo(avenueGraph, tileAt(4, 6), 4) && traffic.canGo(avenueGraph, tileAt(4, 9), 1),
  "from the side street a car turns into a half only with its traffic");
const shortAvenue = traffic.buildRoadGraph(core.streetLayers({ ...avenueTown, avenue: townLayer((x, y) => (x >= 2 ? avenueHalves[tileAt(x, y)] : 0)) }));
test.assert(!traffic.canGo(shortAvenue, tileAt(1, 7), 2) && traffic.canGo(shortAvenue, tileAt(1, 8), 2),
  "a car on an ordinary road may not drive into a half against its traffic");
const avenueTraffic = traffic.createTraffic({ snapshot: avenueStreet, world: townWorld, seed: 91, transit: avenuePlan });
let pairedLights = true;
for (let t = 0; t < 90; t += 0.25) {
  [1, 2, 4, 8].forEach((dir) => [4, 11].forEach((x) => {
    if (traffic.lightFor(avenueTraffic.signals, tileAt(x, 7), dir, t) !== traffic.lightFor(avenueTraffic.signals, tileAt(x, 8), dir, t)) pairedLights = false;
  }));
}
test.assert(avenueTraffic.signals.has(tileAt(4, 7)) && avenueTraffic.signals.has(tileAt(4, 8)) && pairedLights, "the two halves of an avenue crossing are one junction: one light, one timing");
// The other half beside every tile is not a side street: lights stand only
// where a street crosses the avenue, none between crossings or at its ends.
const avenueLights = [...avenueTraffic.signals.keys()].filter((tile) => avenueGraph.avenue[tile]).sort((a, b) => a - b);
test.assert(avenueLights.join() === [tileAt(4, 7), tileAt(11, 7), tileAt(4, 8), tileAt(11, 8)].join(),
  `the avenue has traffic lights only at its two crossings (${avenueLights.map((tile) => `${tile % T},${Math.floor(tile / T)}`).join(" ")})`);

// The town driving itself for fifty seconds with the player parked off the
// road: no car goes against a half's traffic, none is in the median between
// crossings, and with a BRT none is in its busway; the riders keep the
// non-motor lane at the kerb, on an avenue its outer side.
const HALF_AXIS = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] };
const TOWARD_MEDIAN = { 1: [-1, 0], 2: [0, -1], 4: [1, 0], 8: [0, 1] };
const AGENT_HALF_WIDTH = 1.3 * M;
// Out from the median of the avenue half under (x, z), in tiles; null off the avenue.
const outFromMedian = (graph, x, z) => {
  const half = graph.avenue?.[tileAt(Math.floor(x), Math.floor(z))];
  if (!half) return null;
  const [lx, lz] = TOWARD_MEDIAN[half];
  return 0.5 - ((x - Math.floor(x) - 0.5) * lx + (z - Math.floor(z) - 0.5) * lz);
};
const watchAvenue = (snapshot, plan, seed, steps) => {
  const street = traffic.createTraffic({ snapshot, world: townWorld, seed, transit: plan });
  const { graph } = street;
  const parked = { x: 7.5, z: 2.5, y: 0, heading: 0, speed: 0, contact: null };
  const seen = { carSteps: 0, closedSteps: 0, against: 0, inMedian: 0, inBusway: 0, nearest: Infinity, riders: new Map(), riderSteps: 0, avenueRiderSteps: 0, offLane: 0, inner: 0 };
  for (let i = 0; i < steps; i += 1) {
    traffic.stepTraffic(street, parked, core.DT);
    street.cars.forEach((agent) => {
      const out = outFromMedian(graph, agent.x, agent.z);
      if (out === null) return;
      const tile = tileAt(Math.floor(agent.x), Math.floor(agent.z));
      const [hx, hz] = HALF_AXIS[graph.avenue[tile]];
      seen.carSteps += 1;
      if (Math.cos(agent.heading) * hx + Math.sin(agent.heading) * hz < -0.7) seen.against += 1;
      if (graph.medianOpen[tile]) return;
      seen.closedSteps += 1;
      seen.nearest = Math.min(seen.nearest, out - AGENT_HALF_WIDTH);
      if (out - AGENT_HALF_WIDTH < 2 * M) seen.inMedian += 1;
      if (Number(snapshot.busLane?.[tile]) > 0 && out - AGENT_HALF_WIDTH < 5.5 * M - 1e-9) seen.inBusway += 1;
    });
    street.riders.forEach((agent) => {
      const known = seen.riders.get(agent.id) || { kind: agent.kind, top: 0 };
      known.top = Math.max(known.top, agent.speed);
      seen.riders.set(agent.id, known);
      if (agent.down || agent.inDir !== agent.outDir) return;
      seen.riderSteps += 1;
      const acrossX = agent.inDir === 2 || agent.inDir === 8;
      const offset = acrossX ? agent.z - Math.floor(agent.z) - 0.5 : agent.x - Math.floor(agent.x) - 0.5;
      if (Math.abs(Math.abs(offset) - 4.25 * M) > 0.01 * M) seen.offLane += 1;
      const out = outFromMedian(graph, agent.x, agent.z);
      const half = graph.avenue?.[tileAt(Math.floor(agent.x), Math.floor(agent.z))];
      if (out === null || Math.abs(HALF_AXIS[agent.inDir][0] * HALF_AXIS[half][0] + HALF_AXIS[agent.inDir][1] * HALF_AXIS[half][1]) !== 1) return;
      seen.avenueRiderSteps += 1;
      if (out < 11.5 * M) seen.inner += 1;
    });
  }
  return seen;
};
const brtAvenue = watchAvenue(avenueStreet, avenuePlan, 91, 3000);
const openAvenue = watchAvenue(core.streetLayers(avenueTown, null), null, 92, 3000);
test.assert(brtAvenue.closedSteps > 500 && openAvenue.closedSteps > 500 && brtAvenue.against === 0 && openAvenue.against === 0,
  `no car drives an avenue half against its traffic (${brtAvenue.carSteps} and ${openAvenue.carSteps} car-steps on the avenue; ${brtAvenue.against} and ${openAvenue.against} against)`);
test.assert(brtAvenue.inMedian === 0 && openAvenue.inMedian === 0,
  `between crossings no car is in the median (nearest side ${(brtAvenue.nearest / M).toFixed(2)} and ${(openAvenue.nearest / M).toFixed(2)} m out from it)`);
test.assert(brtAvenue.inBusway === 0 && brtAvenue.nearest >= 5.5 * M - 1e-9 && openAvenue.nearest < 5.5 * M,
  `with a BRT the cars keep to the two general lanes, out of its busway; without one they use it as a third lane (${(brtAvenue.nearest / M).toFixed(2)} vs ${(openAvenue.nearest / M).toFixed(2)} m)`);
const riderKinds = [...brtAvenue.riders.values(), ...openAvenue.riders.values()];
test.assert(riderKinds.some((known) => known.kind === "bicycle") && riderKinds.some((known) => known.kind === "ebike"), `bicycles and e-bikes come out on the street (${riderKinds.length} riders)`);
test.assert(brtAvenue.riderSteps > 500 && brtAvenue.offLane + openAvenue.offLane === 0,
  `riders on a straight keep the non-motor lane, 4.25 m out from the centre line (${brtAvenue.offLane + openAvenue.offLane} of ${brtAvenue.riderSteps + openAvenue.riderSteps} rider-steps off it)`);
test.assert(brtAvenue.avenueRiderSteps + openAvenue.avenueRiderSteps > 50 && brtAvenue.inner + openAvenue.inner === 0,
  `along an avenue they ride its outer side, past the non-motor line 11.5 m out from the median (${brtAvenue.avenueRiderSteps + openAvenue.avenueRiderSteps} rider-steps)`);
const meanTop = (kind) => { const list = riderKinds.filter((known) => known.kind === kind); return list.reduce((sum, known) => sum + known.top, 0) / list.length; };
test.assert(meanTop("ebike") > meanTop("bicycle") + 4 * KMH, `e-bikes are faster than bicycles (${(meanTop("ebike") / KMH).toFixed(1)} vs ${(meanTop("bicycle") / KMH).toFixed(1)} km/h at their best)`);

// A red light holds a bicycle at the line; an e-bike that runs reds goes through.
const redAt = (street) => {
  for (let t = 0.25; t < 90; t += 0.25) {
    if (traffic.lightFor(street.signals, tileAt(4, 4), 2, t - 0.25) !== "red" && traffic.lightFor(street.signals, tileAt(4, 4), 2, t) === "red") return t;
  }
  return -1;
};
const rideAtRed = (kind, runsReds) => {
  const street = traffic.createTraffic({ snapshot: town, world: townWorld, seed: 93 });
  street.seconds = redAt(street);
  const bike = { id: 950, kind, cruise: (kind === "ebike" ? 25 : 16) * KMH, wrongWay: false, runsReds, look: 0, speed: 0, down: 0, laneOffset: traffic.BIKE_LANE, tile: tileAt(3, 4), inDir: 2, outDir: 2, s: 0.2, y: 0 };
  bike.path = traffic.tilePath(T, bike.tile, 2, 2, traffic.BIKE_LANE);
  Object.assign(bike, bike.path.at(bike.s));
  bike.speed = bike.cruise;
  street.riders = [bike];
  let furthest = bike.x, enteredOnRed = false;
  for (let i = 0; i < 360; i += 1) {
    traffic.stepTraffic(street, { x: 7.5, z: 7.5, y: 0, heading: 0, speed: 0, contact: null }, core.DT);
    street.riders = street.riders.filter((agent) => agent.id === bike.id);
    furthest = Math.max(furthest, bike.x);
    if (bike.tile === tileAt(4, 4) && traffic.lightFor(street.signals, tileAt(4, 4), 2, street.seconds) === "red") enteredOnRed = true;
  }
  return { furthest, enteredOnRed, speed: bike.speed, red: traffic.lightFor(street.signals, tileAt(4, 4), 2, street.seconds) === "red" };
};
const heldBike = rideAtRed("bicycle", false);
const redRunner = rideAtRed("ebike", true);
test.assert(heldBike.red && !heldBike.enteredOnRed && heldBike.furthest < 4 && heldBike.speed < 0.5 * KMH, `a red light holds a bicycle at the line (stopped at x ${heldBike.furthest.toFixed(3)})`);
test.assert(redRunner.red && redRunner.enteredOnRed, `an e-bike that runs reds goes into the crossing on red (x ${redRunner.furthest.toFixed(3)})`);

// Knocking a rider down: the car hits the e-bike from behind at 40 km/h.
const hitStreet = traffic.createTraffic({ snapshot: avenueStreet, world: townWorld, seed: 94, transit: avenuePlan });
hitStreet.graceUntil = 0;
hitStreet.ranges.crime = { low: 100, high: 200, even: false }; // no patrol to witness it
const victim = { id: 960, kind: "ebike", cruise: 12 * KMH, wrongWay: false, runsReds: false, look: 0, speed: 12 * KMH, down: 0, laneOffset: traffic.BIKE_LANE, tile: tileAt(7, 4), inDir: 2, outDir: 2, s: 0.3, y: 0 };
victim.path = traffic.tilePath(T, victim.tile, 2, 2, traffic.BIKE_LANE);
Object.assign(victim, victim.path.at(victim.s));
const hitter = core.createCar({ x: 5.4, z: 4.5 + 3.2 * M, y: 0, heading: 0 });
hitter.speed = 40 * KMH;
const hitEvents = [];
let hitContact = null, wantedBefore = 0;
for (let i = 0; i < 400 && !victim.down; i += 1) {
  hitStreet.cars = [];
  hitStreet.riders = [victim];
  wantedBefore = hitStreet.wanted;
  core.stepCar(hitter, { throttle: hitter.speed < 40 * KMH ? 1 : 0 }, townWorld, traffic.obstaclesNear(hitStreet, hitter));
  if (hitter.contact) hitContact = hitter.contact;
  hitEvents.push(...traffic.stepTraffic(hitStreet, hitter, core.DT));
}
test.assert(hitContact === victim.id && victim.down > 0 && hitEvents.some((event) => event.type === "rider-down" && event.kind === "ebike"), `a rider is solid to the car, and knocked down lies in the road (${victim.down.toFixed(2)} s to get up)`);
test.assert(hitStreet.wanted === wantedBefore + 2 && hitEvents.some((event) => event.type === "wanted" && event.why === "hit-rider"),
  `knocking a rider down at speed raises the wanted level by two, and says why (${wantedBefore} to ${hitStreet.wanted}: ${hitEvents.filter((event) => event.type === "wanted").map((event) => event.why).join(", ")})`);

// Offences: the player's car moved by hand along the avenue and a plain street.
const offencesOf = (place, steps = 300) => {
  const street = traffic.createTraffic({ snapshot: avenueStreet, world: townWorld, seed: 95, transit: avenuePlan });
  street.graceUntil = 0;
  street.ranges.crime = { low: 100, high: 200, even: false };
  const car = { y: 0, contact: null, ...place, speed: place.kmh * KMH };
  const why = [];
  for (let i = 0; i < steps; i += 1) {
    car.x += Math.cos(car.heading) * car.speed * core.DT;
    car.z += Math.sin(car.heading) * car.speed * core.DT;
    traffic.stepTraffic(street, car, core.DT).forEach((event) => {
      if (event.type === "wanted") why.push(event.why);
      if (event.type === "camera") why.push("camera");
    });
  }
  return why;
};
const withTraffic = offencesOf({ x: 10.9, z: 8 - 7 * M, heading: Math.PI, kmh: 40 });
const againstTraffic = offencesOf({ x: 5.1, z: 8 - 7 * M, heading: 0, kmh: 40 });
const inBusway = offencesOf({ x: 10.9, z: 8 - 3.75 * M, heading: Math.PI, kmh: 40 });
const inBikeLane = offencesOf({ x: 5.1, z: 4.5 + 4.25 * M, heading: 0, kmh: 30 });
const slowInBikeLane = offencesOf({ x: 5.1, z: 4.5 + 4.25 * M, heading: 0, kmh: 15 });
test.assert(withTraffic.length === 0, `driving along an avenue half with its traffic, in a general lane, is no offence (${withTraffic.join(", ")})`);
test.assert(slowInBikeLane.length === 0, `creeping along the non-motor lane is no offence (${slowInBikeLane.join(", ")})`);
test.assert(againstTraffic[0] === "wrong-way", `driving an avenue half against its traffic is the wrong way (${againstTraffic.join(", ")})`);
test.assert(inBusway[0] === "camera", `driving along the BRT busway is filmed (${inBusway.join(", ")})`);
test.assert(inBikeLane[0] === "bike-lane", `driving the non-motor lane at 30 km/h is an offence (${inBikeLane.join(", ")})`);

// A chase keeps to the halves' ways and takes the short way round: a police
// car coming down the side street toward a car stopped on the westbound
// half, east of the crossing, crosses the median there to come round by the
// eastbound half (13 tiles), not off west down the wrong half (19).
const chase = traffic.createTraffic({ snapshot: avenueStreet, world: townWorld, seed: 96, transit: avenuePlan });
chase.graceUntil = 0;
chase.ranges.crime = { low: 100, high: 200, even: false };
chase.wanted = 1;
const chaser = { id: 970, kind: "police", frame: "agent.service.police", cruise: 70 * KMH, speed: 30 * KMH, wait: 0, lane: 1, tile: tileAt(4, 5), inDir: 4, outDir: 4, s: 0, y: 0 };
chaser.path = traffic.tilePath(T, chaser.tile, 4, 4, traffic.LANE);
Object.assign(chaser, chaser.path.at(0));
chase.cars.push(chaser);
let chaseTurn = 0;
for (let i = 0; i < 600 && !chaseTurn; i += 1) {
  traffic.stepTraffic(chase, { x: 6.5, z: 7.5, y: 0, heading: Math.PI, speed: 0, contact: null }, core.DT);
  if (chaser.tile === tileAt(4, 7)) chaseTurn = chaser.outDir;
}
test.assert(chaseTurn === 4, `a police car on a chase takes the short legal way round to a car on the avenue: across the median at the crossing (way out of the crossing ${chaseTurn})`);

// The BRT in the median: 3.75 m out on its own side at mid-avenue, beside
// the island at the stop, round the median's end at either terminal.
const avenueNetwork = rail.buildRailNetwork(avenueStreet, avenuePlan);
const avenueBrt = avenueNetwork.lines.find((line) => line.id === "brt-B2");
const kerbBus = avenueNetwork.lines.find((line) => line.id === "bus-7");
let brtRunning = 0, brtOffSide = 0, brtStanding = 0, brtNotAtIsland = 0, brtJump = 0, kerbOffLane = 0;
const brtTurns = [];
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
let turning = null, lastBrt = null;
for (let t = -2; t <= avenueBrt.period - 1; t += 0.05) {
  const list = rail.buses(avenueNetwork, t);
  const bus = list.find((item) => item.line === avenueBrt.id && item.vehicle === 0);
  const state = rail.trainAt(avenueBrt, t, 0);
  // Right of the bus's heading, out from the median (the avenue runs east-west, its median at z = 8).
  const out = Math.cos(bus.heading) * (bus.z - 8);
  // A turn is measured from the last heading before it to the first after.
  if (state.turn !== undefined && !turning) brtTurns.push(turning = { change: 0, endX: (avenueBrt.path[Math.round(state.pos)] % T) + 0.5, far: 0, beyond: 0 });
  if (lastBrt) {
    brtJump = Math.max(brtJump, Math.hypot(bus.x - lastBrt.x, bus.z - lastBrt.z));
    if (turning) turning.change += wrapAngle(bus.heading - lastBrt.heading);
  }
  if (state.turn !== undefined) {
    turning.far = Math.max(turning.far, Math.hypot(bus.x - turning.endX, bus.z - 8));
    turning.beyond = Math.max(turning.beyond, turning.endX < T / 2 ? turning.endX - bus.x : bus.x - turning.endX);
  } else {
    turning = null;
    if (bus.standing) {
      brtStanding += 1;
      if (Math.floor(bus.x) !== 7 || Math.abs(Math.abs(bus.z - 8) - 3.75 * M) > 1e-9) brtNotAtIsland += 1;
    } else {
      brtRunning += 1;
      if (Math.abs(out - 3.75 * M) > 1e-9) brtOffSide += 1;
    }
  }
  lastBrt = bus;
  const kerb = list.find((item) => item.line === kerbBus.id && item.vehicle === 0);
  const kerbState = rail.trainAt(kerbBus, t, 0);
  if (kerbState.turn === undefined && Math.abs(Math.cos(kerb.heading) * (kerb.z - 11.5) - 2 * M) > 1e-9) kerbOffLane += 1;
}
test.assert(brtRunning > 100 && brtOffSide === 0, `along the avenue the BRT runs in the busway on its own side, 3.75 m out from the median (${brtOffSide} of ${brtRunning} samples off it)`);
test.assert(brtStanding > 50 && brtNotAtIsland === 0, `at the island stop it stands beside the platform, 3.75 m out from the median (${brtStanding} samples)`);
test.assert(brtTurns.length === 2 && brtTurns.every((turn) => turn.far <= 4 * M && turn.beyond > 3 * M && Math.abs(turn.change + Math.PI) < 0.02),
  `at each station-less end it turns back round the median's end, a half circle to the left (${brtTurns.map((turn) => `${(turn.change / Math.PI).toFixed(3)} pi, within ${(turn.far / M).toFixed(2)} m`).join("; ")})`);
test.assert(brtJump < 0.1, `the BRT never jumps (${(brtJump / M).toFixed(2)} m at most between samples)`);
test.assert(kerbOffLane === 0, "an ordinary bus keeps its right-hand lane, 2 m right of the street's centre line");

// --- the character night drive (字符夜航) ---------------------------------------
// A second way to draw the same drive: same town, car, roads and collision,
// at night, drawn as characters on the GPU and filling the stage. Style and
// the classic screen's colour depth are separate preferences.
test.assertIncludes(shellSource, 'const STYLES = Object.freeze(["classic", "glyph"]);', "the screen style is its own preference, beside the colour depth");
test.assertIncludes(shellSource, 'style: STYLES.includes(stored.style) ? stored.style : "classic",', "stored preferences without a style keep the classic screen");
test.assertIncludes(shellSource, '<select data-joyride-pref="style">', "the style is chosen in Preferences with the System 6 select harness");
test.assertIncludes(shellSource, 'const SCREENS = Object.freeze([["classic", "mono"], ["classic", "256"], ["glyph", null]]);', "V cycles black and white, 256 colours and characters, in that order");
test.assert(/if \(glyph\) return;\s+const pixels = live/.test(shellSource), "the character drive is drawn on the canvas; nothing is read back to the CPU");
test.assertIncludes(shellSource, "renderer.render(glyph ? game.nightSnapshot : daySnapshot()", "the character drive is the same town after dark");
test.assertIncludes(shellSource, "const rect = stage.getBoundingClientRect();", "the character screen takes the stage's own size: no letterboxed frame");
test.assertIncludes(shellSource, "new ResizeObserver(", "and follows it when the window or the phone turns");
test.assert(!/buildWorld\(\)[^]*nightSnapshot[^]*rasterizeChunk/.test(shellSource.slice(shellSource.indexOf("function buildWorld"), shellSource.indexOf("function newDrive"))), "collision is still built from the daytime town; night changes light, not geometry");
test.assertIncludes(voxel, "const night = Boolean(state.street && state.streetNight);", "lit windows exist only in the street view at night; the Bonsai City views are unchanged");
test.assertIncludes(voxel, "new THREE.WebGLRenderTarget(cols * 2, rows * 2", "the scene renders into a target of two texels per character cell");
test.assertIncludes(voxel, "if (!state.street || !state.renderer || state.glyph) return null;", "there is no readback while characters are drawn");
test.assertIncludes(read("tooling/vendor/bonsai-renderer-entry.mjs"), "SpotLight", "the vendor subset exports the headlight");
const glyphString = voxel.match(/const GLYPHS = "((?:[^"\\]|\\.)*)";/);
test.assert(glyphString && JSON.parse(`"${glyphString[1]}"`).length === 15, "the atlas holds the twelve-step ramp and three edge characters the shader indexes");

// --- buses, the stop board, cameras, the traffic line (J7, J8) ----------------
{
vm.runInContext(read("app/features/joyride-bus.js"), context);
vm.runInContext(read("app/core/pot-world.js"), context);
const busMod = context.window.AISystem6JoyrideBus;
const busSource = read("app/features/joyride-bus.js");
for (const needle of ["Math.random", "Date.now", "performance.now", "document.", "localStorage", "indexedDB"]) {
  test.assertNotIncludes(busSource, needle, `the bus module stays headless (${needle})`);
}
test.assertNotIncludes(railSource, "const BUS_SPEED", "bus speed is no longer a local constant");
test.assertNotIncludes(railSource, "const BUS_DWELL", "bus dwell is no longer a local constant");
const potWorld = context.AISystem6PotWorld;
context.window.AISystem6PotWorld = potWorld;
const sharedBus = potWorld.transit.MODES.bus.joyride;
const sharedBrt = potWorld.transit.MODES.brt.joyride;
test.assert(rail.busMotion("bus").dwell === sharedBus.dwellSeconds && rail.busMotion("brt").dwell === sharedBrt.dwellSeconds
  && Math.abs(rail.busMotion("bus").speed - sharedBus.kmh * KMH) < 1e-12
  && Math.abs(rail.busMotion("brt").speed - sharedBrt.kmh * KMH) < 1e-12, "bus and BRT speed and dwell are the shared table");
const spacing = loopLine.period / loopLine.vehicles;
test.assert(loopLine.offset >= 0 && loopLine.offset < spacing && brtLine.periodFree <= brtLine.period, "the stagger is shorter than a headway, and a free loop is no slower");
const busFirst = rail.buses(busNetwork, 12);
const busSecond = rail.buses(busNetwork, 12);
test.assert(JSON.stringify(busFirst) === JSON.stringify(busSecond), "the same handover and the same time put the buses in the same places");
const savedVehicles = loopLine.vehicles;
loopLine.vehicles = 36;
const near = busMod.materialise(busNetwork, 0, { x: 8, z: 8 });
const nearAgain = busMod.materialise(busNetwork, 0, { x: 8, z: 8 });
test.assert(near.length <= 12 && near.every((item) => Math.max(Math.abs(item.x - 8), Math.abs(item.z - 8)) <= 22)
  && JSON.stringify(near) === JSON.stringify(nearAgain), `only the nearest dozen buses are drawn (${near.length})`);
loopLine.vehicles = savedVehicles;
const bare = traffic.createTraffic({ snapshot: busTown, world: townWorld, seed: 3, transit: busPlan });
test.assert(!traffic.streetObjects(bare, { x: 8, z: 8, y: 0 }).some((item) => String(item.frame).startsWith("agent.bus")), "without bus frames the street draws no empty bus");
context.window.AISystem6BonsaiFrameIndex = new Set(["agent.bus.1", "agent.bus.brt.front", "agent.bus.brt.rear"]);
test.assert(traffic.streetObjects(bare, { x: 8, z: 8, y: 0 }).some((item) => String(item.frame).startsWith("agent.bus")), "with the frames, the buses are on the street");
delete context.window.AISystem6BonsaiFrameIndex;

const signals = new Map([[4, { tile: 4, nsGreen: 10, ewGreen: 10, cycle: 26, offset: 0 }]]);
let lightsMatch = true;
for (const dir of [1, 2, 4, 8]) for (let t = 0; t < 26; t += 1) {
  const seen = busMod.signalAt({ signals, tile: 4, dir, seconds: t, amber: traffic.AMBER, rail: { lines: [] }, buses: [], size: T, lightFor: traffic.lightFor });
  if (seen !== traffic.lightFor(signals, 4, dir, t)) lightsMatch = false;
}
test.assert(lightsMatch, "with no BRT the signal is the ordinary light");
const brtProbe = { kind: "brt", line: "brt-probe", x: 2.5, z: 0.5, heading: 0, vehicle: 0 };
const probeRail = { lines: [{ id: "brt-probe", kind: "brt", path: [0, 1, 2, 3, 4] }] };
const held = busMod.signalAt({ signals, tile: 4, dir: 2, seconds: 12, amber: traffic.AMBER, rail: probeRail, buses: [brtProbe], size: T, lightFor: traffic.lightFor });
const cross = busMod.signalAt({ signals, tile: 4, dir: 1, seconds: 12, amber: traffic.AMBER, rail: probeRail, buses: [brtProbe], size: T, lightFor: traffic.lightFor });
const plain = busMod.signalAt({ signals, tile: 4, dir: 2, seconds: 12, amber: traffic.AMBER, rail: probeRail, buses: [{ ...brtProbe, kind: "bus" }], size: T, lightFor: traffic.lightFor });
test.assert(held === "green" && cross === "red" && plain === traffic.lightFor(signals, 4, 2, 12), `a BRT within three tiles takes the green; a bus does not (${held}, ${cross}, ${plain})`);

let arriving = null;
for (let t = 0; t < loopLine.period && !arriving; t += 0.5) {
  const board = busMod.stopBoard(busNetwork, "bus-3:7,4", t);
  if (board.some((row) => row.arriving)) arriving = board;
  if (board.some((row) => row.minutes !== null && row.minutes < 1)) arriving = { bad: true, board };
}
test.assert(arriving && !arriving.bad && arriving.some((row) => row.arriving), "a bus standing at the stop reads as arriving, and a wait is never zero minutes");

test.assert(busMod.cameraRule({ speed: 40, seconds: 1.4, inBusLane: true, junction: false, exempt: false }) === null, "1.4 seconds in the bus lane is not filmed");
test.assert(busMod.cameraRule({ speed: 40, seconds: 1.5, inBusLane: true, junction: false, exempt: false })?.fine === 50, "1.5 seconds in the bus lane is a 50 fine");
test.assert(busMod.cameraRule({ speed: 40, seconds: 3, inBusLane: true, junction: true, exempt: false }) === null, "a junction is not filmed");
test.assert(busMod.cameraRule({ speed: 40, seconds: 3, inBusLane: true, junction: false, exempt: true }) === null, "an exempt driver is not filmed");
const filmed = traffic.createTraffic({ snapshot: avenueStreet, world: townWorld, seed: 95, transit: avenuePlan });
filmed.graceUntil = 0;
filmed.ranges.crime = { low: 100, high: 200, even: false };
filmed.money = 200;
const filmCar = { x: 10.9, z: 8 - 3.75 * M, y: 0, heading: Math.PI, speed: 40 * KMH, contact: null };
let filmedCamera = false;
for (let i = 0; i < 120; i += 1) {
  filmCar.x += Math.cos(filmCar.heading) * filmCar.speed * core.DT;
  filmCar.z += Math.sin(filmCar.heading) * filmCar.speed * core.DT;
  if (traffic.stepTraffic(filmed, filmCar, core.DT).some((event) => event.type === "camera" && event.fine === 50)) filmedCamera = true;
}
test.assert(filmedCamera && filmed.money === 150 && filmed.wanted === 0, `the camera takes 50 and does not raise the wanted level (${filmed.money}, wanted ${filmed.wanted})`);

let laneSteps = 0;
const keepOut = traffic.createTraffic({ snapshot: busTown, world: townWorld, seed: 81, transit: busPlan });
for (let i = 0; i < 20000; i += 1) {
  traffic.stepTraffic(keepOut, { x: 4.5 - 2.5 * M, z: 2.5, y: 0, heading: Math.PI / 2, speed: 0, contact: null }, core.DT);
  keepOut.cars.forEach((agent) => {
    const tile = Math.floor(agent.z) * T + Math.floor(agent.x);
    if (agent.kind !== "police" && busTown.busLane[tile] && keepOut.graph.armCount(tile) < 3) laneSteps += 1;
  });
}
test.assert(laneSteps === 0, `cars do not drive a bus lane except through a junction (${laneSteps})`);

const letterTown = traffic.createTraffic({ snapshot: busTown, world: townWorld, seed: 71, transit: busPlan });
letterTown.diary.railWaitSeconds = 90;
letterTown.diary.busWait = { seconds: 23, x: 7, y: 4 };
const beforeBus = JSON.stringify(traffic.letterFacts(letterTown).list.find((fact) => fact.key === "rail-wait"));
letterTown.diary.busWait = { seconds: 23, x: 7, y: 4 };
test.assert(!traffic.letterFacts(letterTown).list.some((fact) => fact.key === "bus-wait"), "23 street seconds of waiting is not a bus-wait");
letterTown.diary.busWait = { seconds: 24, x: 7, y: 4 };
const waited = traffic.letterFacts(letterTown).list.find((fact) => fact.key === "bus-wait");
const railFact = traffic.letterFacts(letterTown).list.find((fact) => fact.key === "rail-wait");
test.assert(waited && waited.n === 6 && waited.x === 7 && waited.y === 4 && JSON.stringify(railFact) === beforeBus, `a 24 second wait is 6 city minutes at the stop, and the train wait is unchanged (${JSON.stringify(waited)})`);

const bulletin = {
  lines: [
    { id: "brt-1", kind: "brt", name: { zh: "快1线", en: "BRT 1" }, period: 80, periodFree: 80, number: 1 },
    { id: "bus-11", kind: "bus", name: { zh: "11路", en: "Route 11" }, period: 100, periodFree: 84, number: 11 },
  ],
};
test.assert(busMod.trafficLine({ lines: [] }, town, 0, "zh") === "", "no rubber-tyre line, no traffic line");
test.assert(busMod.trafficLine(bulletin, { size: 4, congested: new Uint8Array(16) }, 0, "zh") === "快1线准点 · 11路晚 4 分", "the Chinese traffic line is the template plus the measured minutes");
test.assert(busMod.trafficLine(bulletin, { size: 4, congested: new Uint8Array(16) }, 0, "en") === "BRT 1 on time · Route 11 4 min late", "the English traffic line is the template plus the measured minutes");
test.assert(busMod.trafficLine(bulletin, { size: 4, congested: new Uint8Array(16) }, 0, "zh") === busMod.trafficLine(bulletin, { size: 4, congested: new Uint8Array(16) }, 0, "zh"), "the traffic line is pure");
test.assert(busMod.settleBusJob([0, 30, 60, 90], [0, 30, 60, 90]).pay === 160, "four on-time stops pay 160");
test.assert(busMod.settleBusJob([0, 30, 60, 90], [0, 30, 100, 200]).pay === 110, "two on-time stops pay 110");
test.assert(busMod.settleBusJob([0, 30], [40, 70]).pay === 60, "a finished run with no on-time stop still pays 60");
test.assert(busMod.settleBusJob([0], [30]).onTime === 1 && busMod.settleBusJob([0], [30.1]).onTime === 0, "30.0 seconds is on time and 30.1 is not");
const scheduled = busMod.scheduleFor(brtLine, brtLine.stops, 0);
const scheduledAgain = busMod.scheduleFor(brtLine, brtLine.stops, 0);
test.assert(JSON.stringify(scheduled) === JSON.stringify(scheduledAgain) && scheduled.length === brtLine.stops.length, "the bus schedule is a pure list of arrivals");
}

test.finish();
