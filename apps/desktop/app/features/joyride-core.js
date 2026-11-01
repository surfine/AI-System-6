// Joyride / 兜风 — the headless core.
//
// Everything here is a pure function of its inputs: no DOM, canvas, clock,
// timers or unseeded randomness. The shell (joyride.js) owns the window, the input
// devices and the frame pacing; this file owns
//
// - the 1996 picture: the classic Mac OS 8-bit system palette, 256-colour
//   quantization, the "thousands" (5-5-5) truncation and 1-bit Atkinson
//   dithering, applied to a frame the renderer read back;
// - the street world: the voxel renderer's own chunk blocks and model voxels
//   rasterized into one-metre columns (ground, one floating deck, water), so
//   what the car touches is exactly what is drawn;
// - the car: fixed-step arcade physics against that world, replayable from a
//   seed and an input sequence;
// - the demonstration city: Bonsai City's starter town replayed by the
//   simulation, plus five roads (a long bridge loop and a hill climb). It is
//   built in memory and never saved; Joyride writes nothing to Bonsai City.
//
// Contract: tests/features/joyride.test.mjs.
(function installJoyrideCore(global) {
  "use strict";

  // --- the picture -----------------------------------------------------------

  // The Macintosh 8-bit system colour table: the 6x6x6 cube in descending
  // order (white first) without its black, then ten-step ramps of red, green,
  // blue and grey, and black last -- 215 + 40 + 1 = 256 entries.
  const RAMP = [0xee, 0xdd, 0xbb, 0xaa, 0x88, 0x77, 0x55, 0x44, 0x22, 0x11];
  const CUBE = [0xff, 0xcc, 0x99, 0x66, 0x33, 0x00];
  function macSystemPalette() {
    const out = new Uint8Array(256 * 3);
    let n = 0;
    const put = (r, g, b) => { out[n * 3] = r; out[n * 3 + 1] = g; out[n * 3 + 2] = b; n += 1; };
    for (const r of CUBE) for (const g of CUBE) for (const b of CUBE) if (r || g || b) put(r, g, b);
    RAMP.forEach((v) => put(v, 0, 0));
    RAMP.forEach((v) => put(0, v, 0));
    RAMP.forEach((v) => put(0, 0, v));
    RAMP.forEach((v) => put(v, v, v));
    put(0, 0, 0);
    return out;
  }
  const PALETTE = macSystemPalette();

  // Nearest palette entry for every 15-bit colour, built once. The weights
  // follow the eye (green most, blue least), as the Colour Manager's
  // inverse table did.
  let paletteLookup = null;
  function paletteIndexTable() {
    if (paletteLookup) return paletteLookup;
    const table = new Uint8Array(32768);
    for (let key = 0; key < 32768; key += 1) {
      const r = ((key >> 10) << 3) | 4;
      const g = (((key >> 5) & 31) << 3) | 4;
      const b = ((key & 31) << 3) | 4;
      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < 256; i += 1) {
        const dr = r - PALETTE[i * 3];
        const dg = g - PALETTE[i * 3 + 1];
        const db = b - PALETTE[i * 3 + 2];
        const distance = 3 * dr * dr + 4 * dg * dg + 2 * db * db;
        if (distance < bestDistance) { bestDistance = distance; best = i; }
      }
      table[key] = best;
    }
    paletteLookup = table;
    return table;
  }

  function nearestPaletteIndex(r, g, b) {
    return paletteIndexTable()[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
  }

  // The source is RGBA bytes; `flipY` reads it bottom row first, which is how
  // WebGL returns a frame. The output is RGBA bytes top row first, ready for
  // putImageData.
  function sourceRow(y, height, flipY) {
    return flipY ? height - 1 - y : y;
  }

  function quantize256(source, width, height, out, flipY = false) {
    const table = paletteIndexTable();
    for (let y = 0; y < height; y += 1) {
      let s = sourceRow(y, height, flipY) * width * 4;
      let o = y * width * 4;
      for (let x = 0; x < width; x += 1, s += 4, o += 4) {
        const index = table[((source[s] >> 3) << 10) | ((source[s + 1] >> 3) << 5) | (source[s + 2] >> 3)] * 3;
        out[o] = PALETTE[index];
        out[o + 1] = PALETTE[index + 1];
        out[o + 2] = PALETTE[index + 2];
        out[o + 3] = 255;
      }
    }
    return out;
  }

  // "Thousands of colours": 5 bits a channel, each level spread back over
  // 0..255 the way a 16-bit framebuffer's DAC showed it.
  const FIVE_BIT = Uint8Array.from({ length: 32 }, (_, v) => Math.round(v * 255 / 31));
  function quantizeThousands(source, width, height, out, flipY = false) {
    for (let y = 0; y < height; y += 1) {
      let s = sourceRow(y, height, flipY) * width * 4;
      let o = y * width * 4;
      for (let x = 0; x < width; x += 1, s += 4, o += 4) {
        out[o] = FIVE_BIT[source[s] >> 3];
        out[o + 1] = FIVE_BIT[source[s + 1] >> 3];
        out[o + 2] = FIVE_BIT[source[s + 2] >> 3];
        out[o + 3] = 255;
      }
    }
    return out;
  }

  // Bill Atkinson's error diffusion for MacPaint: each pixel goes to black
  // or white and passes 1/8 of its error to six neighbours -- right, two
  // right, below-left, below, below-right and two below. Only 6/8 of the
  // error travels, which keeps highlights and shadows clean.
  let ditherScratch = null;
  function ditherAtkinson(source, width, height, out, flipY = false) {
    const stride = width + 4;
    const size = stride * (height + 2);
    if (!ditherScratch || ditherScratch.length < size) ditherScratch = new Float32Array(size);
    const lum = ditherScratch;
    lum.fill(0, 0, size);
    for (let y = 0; y < height; y += 1) {
      let s = sourceRow(y, height, flipY) * width * 4;
      const row = y * stride + 2;
      for (let x = 0; x < width; x += 1, s += 4) lum[row + x] = 0.299 * source[s] + 0.587 * source[s + 1] + 0.114 * source[s + 2];
    }
    for (let y = 0; y < height; y += 1) {
      const row = y * stride + 2;
      let o = y * width * 4;
      for (let x = 0; x < width; x += 1, o += 4) {
        const i = row + x;
        const value = lum[i];
        const ink = value < 128 ? 0 : 255;
        const error = (value - ink) / 8;
        lum[i + 1] += error;
        lum[i + 2] += error;
        lum[i + stride - 1] += error;
        lum[i + stride] += error;
        lum[i + stride + 1] += error;
        lum[i + stride * 2] += error;
        out[o] = ink;
        out[o + 1] = ink;
        out[o + 2] = ink;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  const DEPTHS = Object.freeze(["mono", "256", "thousands"]);
  // Black-and-white is the compact Mac's 512 x 342; colour is a 13-inch
  // monitor's 640 x 480.
  const RESOLUTIONS = Object.freeze({ mono: Object.freeze([512, 342]), 256: Object.freeze([640, 480]), thousands: Object.freeze([640, 480]) });

  function convertFrame(depth, source, width, height, out, flipY = true) {
    if (depth === "mono") return ditherAtkinson(source, width, height, out, flipY);
    if (depth === "thousands") return quantizeThousands(source, width, height, out, flipY);
    return quantize256(source, width, height, out, flipY);
  }

  // --- the street world -------------------------------------------------------
  //
  // One cell per metre (16 per Bonsai tile). A cell holds
  //   ground  the lowest solid run [bottom, top]: terrain and everything that
  //           stands on it without a gap (roads, lots, walls, trunks);
  //   deck    one floating slab [bottom, top] above the ground (a bridge
  //           deck, a guard rail), several merged into one when they stack;
  //   water   the water surface, -Infinity where there is none.
  // A car at height y occupies [y + step, y + height] above its support.
  // Spans may arrive in any order (a building's columns can come from the
  // neighbouring chunk); the merge below gives the same column either way.

  const CELLS = 16;
  const EPSILON = 1e-4;

  function createStreetWorld(sizeTiles, layer) {
    const side = Math.max(1, Math.round(sizeTiles)) * CELLS;
    const count = side * side;
    const ground = new Float32Array(count).fill(-Infinity);
    const groundBottom = new Float32Array(count).fill(Infinity);
    const deckBottom = new Float32Array(count).fill(Infinity);
    const deckTop = new Float32Array(count).fill(-Infinity);
    const water = new Float32Array(count).fill(-Infinity);
    const unit = Number.isFinite(layer) && layer > 0 ? layer : 1 / 16;
    return {
      size: sizeTiles,
      side,
      cells: CELLS,
      layer: unit,
      step: unit * 1.15,
      carHeight: unit * 3.4,
      ground, groundBottom, deckBottom, deckTop, water,
    };
  }

  // A span touching the ground run joins it; one below it becomes the new
  // ground and lifts the old one into the deck; one above floats as the deck.
  // A deck that comes down to the ground merges into it.
  function applySpan(world, cell, bottom, top) {
    if (!(top > bottom)) return;
    const { ground, groundBottom, deckBottom, deckTop } = world;
    const floatUp = (low, high) => {
      deckBottom[cell] = Math.min(deckBottom[cell], low);
      deckTop[cell] = Math.max(deckTop[cell], high);
    };
    if (ground[cell] === -Infinity) {
      groundBottom[cell] = bottom;
      ground[cell] = top;
    } else if (bottom <= ground[cell] + EPSILON && top >= groundBottom[cell] - EPSILON) {
      groundBottom[cell] = Math.min(groundBottom[cell], bottom);
      ground[cell] = Math.max(ground[cell], top);
    } else if (top < groundBottom[cell]) {
      floatUp(groundBottom[cell], ground[cell]);
      groundBottom[cell] = bottom;
      ground[cell] = top;
    } else {
      floatUp(bottom, top);
    }
    if (deckTop[cell] !== -Infinity && deckBottom[cell] <= ground[cell] + EPSILON) {
      ground[cell] = Math.max(ground[cell], deckTop[cell]);
      deckBottom[cell] = Infinity;
      deckTop[cell] = -Infinity;
    }
  }

  // Per model, its voxel columns as runs: [x, y, zStart, zEnd) in voxels.
  function modelColumnRuns(voxels) {
    const { w, d, h, data } = voxels;
    const runs = [];
    for (let y = 0; y < d; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let start = -1;
        for (let z = 0; z <= h; z += 1) {
          const solid = z < h && data[x + w * (y + d * z)] !== 0;
          if (solid && start < 0) start = z;
          if (!solid && start >= 0) { runs.push(x, y, start, z); start = -1; }
        }
      }
    }
    return { w, d, runs: Int16Array.from(runs) };
  }

  // Rasterize one chunk's blocks and models (the renderer's streetChunkBlocks
  // output) into the world. `surfaceAt` is the renderer's own slope formula
  // (pure.surfaceAt), `altStep` its ALT_STEP, `modelRuns(index)` returns
  // modelColumnRuns for a model.
  function rasterizeChunk(world, blocks, options) {
    const side = world.side;
    const cells = world.cells;
    const surfaceAt = options.surfaceAt;
    const altStep = options.altStep;
    const addBox = (block) => {
      const x0 = Math.max(0, Math.floor((block.x - block.sx / 2) * cells + EPSILON));
      const x1 = Math.min(side - 1, Math.ceil((block.x + block.sx / 2) * cells - EPSILON) - 1);
      const z0 = Math.max(0, Math.floor((block.z - block.sz / 2) * cells + EPSILON));
      const z1 = Math.min(side - 1, Math.ceil((block.z + block.sz / 2) * cells - EPSILON) - 1);
      const slope = typeof block.shape === "string" && block.shape.startsWith("slope-") ? Number(block.shape.slice(6)) & 15 : 0;
      const gx = block.shearX || 0;
      const gz = block.shearZ || 0;
      for (let cz = z0; cz <= z1; cz += 1) {
        for (let cx = x0; cx <= x1; cx += 1) {
          const px = (cx + 0.5) / cells;
          const pz = (cz + 0.5) / cells;
          const shear = gx * (px - block.x) + gz * (pz - block.z);
          let top = block.y + block.sy / 2 + shear;
          const bottom = block.y - block.sy / 2 + shear;
          if (slope) {
            const s = Math.max(0, Math.min(1, (px - (block.x - block.sx / 2)) / block.sx));
            const t = Math.max(0, Math.min(1, (pz - (block.z - block.sz / 2)) / block.sz));
            top += surfaceAt(slope, s, t).h * (block.sy / altStep);
          }
          applySpan(world, cz * side + cx, bottom, top);
        }
      }
    };
    (blocks.opaque || []).forEach(addBox);
    (blocks.models || []).forEach((instance) => {
      const model = options.modelRuns(instance.model);
      if (!model) return;
      const quarter = ((instance.quarter || 0) % 4 + 4) % 4;
      const { w, d, runs } = model;
      for (let i = 0; i < runs.length; i += 4) {
        const lx = (runs[i] + 0.5 - w / 2) / cells;
        const lz = (runs[i + 1] + 0.5 - d / 2) / cells;
        // three.js rotation about y: x' = x cos + z sin, z' = -x sin + z cos.
        const wx = quarter === 0 ? lx : quarter === 1 ? lz : quarter === 2 ? -lx : -lz;
        const wz = quarter === 0 ? lz : quarter === 1 ? -lx : quarter === 2 ? -lz : lx;
        const cx = Math.floor((instance.x + wx) * cells);
        const cz = Math.floor((instance.z + wz) * cells);
        if (cx < 0 || cz < 0 || cx >= side || cz >= side) continue;
        applySpan(world, cz * side + cx, instance.y + runs[i + 2] * world.layer, instance.y + runs[i + 3] * world.layer);
      }
    });
    (blocks.water || []).forEach((block) => {
      const x0 = Math.max(0, Math.floor((block.x - block.sx / 2) * cells + EPSILON));
      const x1 = Math.min(side - 1, Math.ceil((block.x + block.sx / 2) * cells - EPSILON) - 1);
      const z0 = Math.max(0, Math.floor((block.z - block.sz / 2) * cells + EPSILON));
      const z1 = Math.min(side - 1, Math.ceil((block.z + block.sz / 2) * cells - EPSILON) - 1);
      for (let cz = z0; cz <= z1; cz += 1) for (let cx = x0; cx <= x1; cx += 1) {
        const cell = cz * side + cx;
        world.water[cell] = Math.max(world.water[cell], block.y + block.sy / 2);
      }
    });
    return world;
  }

  function cellAt(world, x, z) {
    const cx = Math.floor(x * world.cells);
    const cz = Math.floor(z * world.cells);
    if (cx < 0 || cz < 0 || cx >= world.side || cz >= world.side) return -1;
    return cz * world.side + cx;
  }

  // The highest surface under (x, z) the car can reach from height y: the
  // ground or the deck, whichever is highest without being more than one
  // step above y. -Infinity when both are out of reach (a wall).
  function supportAt(world, x, z, y) {
    const cell = cellAt(world, x, z);
    if (cell < 0) return -Infinity;
    const limit = y + world.step;
    let best = -Infinity;
    const ground = world.ground[cell];
    if (ground <= limit) best = ground;
    const deck = world.deckTop[cell];
    if (deck !== -Infinity && deck <= limit && deck > best) best = deck;
    return best;
  }

  // Would a car standing at height y overlap something in this column?
  // Walls (ground above a step), a deck across the cabin, open water, and
  // the edge of the map all block.
  function blockedAt(world, x, z, y) {
    const cell = cellAt(world, x, z);
    if (cell < 0) return true;
    const low = y + world.step;
    const high = y + world.carHeight;
    if (world.ground[cell] > low) return true;
    if (world.deckTop[cell] !== -Infinity && world.deckBottom[cell] < high && world.deckTop[cell] > low) return true;
    const support = supportAt(world, x, z, y);
    if (world.water[cell] > support + world.layer * 0.5) return true;
    return false;
  }

  // --- the car ------------------------------------------------------------------
  //
  // Arcade handling at a fixed 60 Hz step. Distances are Bonsai world units
  // (one tile, 16 m); the tuning numbers are written in metres and seconds.

  const STEP_HZ = 60;
  const DT = 1 / STEP_HZ;
  const METRE = 1 / 16;
  const CAR = Object.freeze({
    halfLength: 2.9 * METRE,
    halfWidth: 1.3 * METRE,
    wheelbase: 3.2 * METRE,
    topSpeed: 30 * METRE,
    reverseSpeed: 9 * METRE,
    engine: 11 * METRE,
    brake: 22 * METRE,
    rolling: 1.4 * METRE,
    // Air drag k*v^2 with k in 1/m, rescaled for speeds in world units.
    drag: 0.0028 / METRE,
    gravity: 18 * METRE,
    maxSteer: 0.62,
    fastSteer: 0.12,
    steerRate: 3.2,
    // Tyres: the most sideways acceleration they hold (about 2 g, an
    // arcade car's grip). A turn that asks for more slides; the handbrake
    // lets go of most of it and swings the tail.
    grip: 20 * METRE,
    handbrakeGrip: 0.22,
    handbrakeYaw: 1.5,
    handbrakeDrag: 9 * METRE,
  });

  // Sample points over the car's footprint, in its own frame (nose +x).
  const FOOTPRINT = Object.freeze([
    [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1], [0, 0],
  ].map(([a, b]) => Object.freeze([a * CAR.halfLength, b * CAR.halfWidth])));

  function createCar(spawn) {
    return {
      x: spawn.x, z: spawn.z, y: spawn.y,
      heading: spawn.heading || 0,
      speed: 0, slip: 0, steer: 0, vy: 0, damage: 0,
      pitch: 0, roll: 0,
      grounded: true, bumped: 0, tick: 0,
    };
  }

  function footprintPoints(car, x, z, heading) {
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    return FOOTPRINT.map(([a, b]) => [x + a * c - b * s, z + a * s + b * c]);
  }

  // Where the car would rest at (x, z), and what each footprint point
  // meets. The car rests on the highest support under it; each point's body
  // follows the road under that point (the car tilts on a slope), except
  // over a drop, where the body hangs at the car's height. A point is
  // blocked when it is inside a wall or its body band meets a deck or water.
  function settle(world, car, x, z, heading) {
    const points = footprintPoints(car, x, z, heading);
    const supports = points.map(([px, pz]) => supportAt(world, px, pz, car.y));
    const rest = Math.max(...supports);
    const body = rest >= car.y - world.step ? rest : car.y;
    const tilt = world.step * 3;
    const blocked = points.map(([px, pz], i) => supports[i] === -Infinity
      || blockedAt(world, px, pz, supports[i] >= body - tilt ? supports[i] : body));
    // Other vehicles (P1 traffic): a pose overlapping one is refused, and
    // the one met is remembered for whoever asked.
    const other = touching(x, z, heading, body, world.layer);
    if (other !== null) {
      blocked[0] = true;
      contactId = other;
    }
    return { rest, body, points, supports, blocked };
  }

  // --- other vehicles -------------------------------------------------------------
  //
  // The traffic around the car, as boxes: { id, x, z, y, heading, halfLength,
  // halfWidth }. stepCar takes them for the length of one step; a box is
  // solid to the car like a wall, and the step reports which one it met.
  let obstacles = null;
  let contactId = null;

  function overlapOnAxis(ax, az, a, b) {
    const project = (box) => {
      const c = Math.cos(box.heading), s = Math.sin(box.heading);
      const centre = box.x * ax + box.z * az;
      const radius = Math.abs((c * ax + s * az) * box.halfLength) + Math.abs((-s * ax + c * az) * box.halfWidth);
      return [centre - radius, centre + radius];
    };
    const [a0, a1] = project(a);
    const [b0, b1] = project(b);
    return a0 < b1 && b0 < a1;
  }

  // Separating axes for two boxes on the ground plane.
  function boxesOverlap(a, b) {
    for (const box of [a, b]) {
      const c = Math.cos(box.heading), s = Math.sin(box.heading);
      if (!overlapOnAxis(c, s, a, b) || !overlapOnAxis(-s, c, a, b)) return false;
    }
    return true;
  }

  function touching(x, z, heading, y, layer) {
    if (!obstacles || !obstacles.length) return null;
    const self = { x, z, heading, halfLength: CAR.halfLength, halfWidth: CAR.halfWidth };
    for (const other of obstacles) {
      if (Number.isFinite(other.y) && Math.abs(other.y - y) > layer * 2.5) continue;
      if (boxesOverlap(self, other)) return other.id;
    }
    return null;
  }

  function restingHeight(world, car, x, z, heading) {
    const pose = settle(world, car, x, z, heading);
    return pose.rest === -Infinity || pose.blocked.some(Boolean) ? null : pose.rest;
  }

  // For instruments: is every point of the car's footprint clear of the
  // world at its present height? A false here would be a car inside a wall.
  function carIsClear(world, car) {
    return !settle(world, car, car.x, car.z, car.heading).blocked.some(Boolean);
  }

  // Why a pose is refused, point by point (for instruments and contracts).
  function footprintReport(world, car, x = car.x, z = car.z, heading = car.heading) {
    const pose = settle(world, car, x, z, heading);
    return pose.points.map(([px, pz], i) => {
      const cell = cellAt(world, px, pz);
      return {
        x: px, z: pz, support: pose.supports[i], blocked: pose.blocked[i], body: pose.body,
        ground: cell < 0 ? null : world.ground[cell], deck: cell < 0 ? null : [world.deckBottom[cell], world.deckTop[cell]], water: cell < 0 ? null : world.water[cell],
      };
    });
  }

  function clamp(value, low, high) {
    return value < low ? low : value > high ? high : value;
  }

  // input: { throttle 0..1, brake 0..1, steer -1..1 (right positive) }.
  function stepCar(car, input, world, others = null) {
    obstacles = Array.isArray(others) ? others : null;
    contactId = null;
    try {
      return stepCarInWorld(car, input, world);
    } finally {
      car.contact = contactId;
      obstacles = null;
    }
  }

  function stepCarInWorld(car, input, world) {
    // A wrecked car's engine is dead: no throttle until it is towed.
    const throttle = (car.damage || 0) >= 100 ? 0 : clamp(Number(input?.throttle) || 0, 0, 1);
    const brake = clamp(Number(input?.brake) || 0, 0, 1);
    const steerInput = clamp(Number(input?.steer) || 0, -1, 1);
    const handbrake = clamp(Number(input?.handbrake) || 0, 0, 1);
    if (!Number.isFinite(car.slip)) car.slip = 0;
    car.tick += 1;
    car.bumped = Math.max(0, car.bumped - 1);

    // Steering eases toward the wheel and tightens with speed.
    const speedShare = clamp(Math.abs(car.speed) / CAR.topSpeed, 0, 1);
    const steerLimit = CAR.maxSteer + (CAR.fastSteer - CAR.maxSteer) * speedShare;
    const wanted = steerInput * steerLimit;
    const steerStep = CAR.steerRate * DT;
    car.steer += clamp(wanted - car.steer, -steerStep, steerStep);

    // Pedals: the brake stops the car and, held at a standstill, reverses it.
    let accel = 0;
    if (throttle > 0) accel += car.speed < 0 ? CAR.brake * throttle : CAR.engine * throttle * (1 - clamp(car.speed / CAR.topSpeed, 0, 1));
    if (brake > 0) accel -= car.speed > 0.4 * METRE ? CAR.brake * brake : CAR.engine * 0.6 * brake * (1 - clamp(-car.speed / CAR.reverseSpeed, 0, 1));
    if (car.grounded) accel -= CAR.gravity * Math.sin(car.pitch);
    // The handbrake locks the rear wheels: it slows the car, gently.
    if (handbrake > 0 && car.grounded) accel -= Math.sign(car.speed) * CAR.handbrakeDrag * handbrake;
    let speed = car.speed + accel * DT;
    // Rolling resistance and drag pull toward a standstill, never past it.
    const fade = (CAR.rolling + CAR.drag * speed * speed) * DT;
    speed = Math.abs(speed) <= fade ? 0 : speed - Math.sign(speed) * fade;
    car.speed = clamp(speed, -CAR.reverseSpeed, CAR.topSpeed);

    // Turning never swings the body into a wall: a turn that would is held.
    // The body turns at the bicycle-model rate; the car's motion keeps its
    // old direction and the tyres pull it round, up to their grip. Below the
    // grip that is the same path as before; above it the car slides wide,
    // and with the handbrake the tail comes round.
    const before = car.heading;
    if (car.grounded && car.speed !== 0) {
      const yawBoost = handbrake > 0 && Math.abs(car.speed) > 6 * METRE ? 1 + (CAR.handbrakeYaw - 1) * handbrake : 1;
      let yaw = (car.speed / CAR.wheelbase) * Math.tan(car.steer) * yawBoost;
      // Without the handbrake the body turns at most a little faster than
      // the tyres can bend the path, so a car at its limit drifts wide in a
      // controlled slide instead of spinning; the handbrake lifts the cap.
      if (handbrake <= 0) {
        const cap = (CAR.grip * 1.15) / Math.max(Math.abs(car.speed), METRE);
        yaw = clamp(yaw, -cap, cap);
      }
      const heading = car.heading + yaw * DT;
      if (restingHeight(world, car, car.x, car.z, heading) !== null) car.heading = heading;
    }
    if (car.heading !== before || car.slip !== 0) {
      // The velocity, unchanged by the turn, in the new heading's frame.
      const turn = car.heading - before;
      const forward = car.speed * Math.cos(turn) + car.slip * Math.sin(turn);
      let side = -car.speed * Math.sin(turn) + car.slip * Math.cos(turn);
      const hold = (car.grounded ? CAR.grip : 0) * (handbrake > 0 ? 1 - (1 - CAR.handbrakeGrip) * handbrake : 1) * DT;
      side = Math.abs(side) <= hold ? 0 : side - Math.sign(side) * hold;
      car.speed = clamp(forward, -CAR.reverseSpeed, CAR.topSpeed);
      car.slip = side;
    }
    const lateralX = -Math.sin(car.heading), lateralZ = Math.cos(car.heading);
    const dx = (Math.cos(car.heading) * car.speed + lateralX * car.slip) * DT;
    const dz = (Math.sin(car.heading) * car.speed + lateralZ * car.slip) * DT;

    // Move; on a hit try each axis alone (scraping along a wall), else stop.
    let rest = restingHeight(world, car, car.x + dx, car.z + dz, car.heading);
    if (rest !== null) {
      car.x += dx;
      car.z += dz;
    } else {
      const alongX = restingHeight(world, car, car.x + dx, car.z, car.heading);
      const alongZ = alongX === null ? restingHeight(world, car, car.x, car.z + dz, car.heading) : null;
      if (alongX !== null && Math.abs(dx) > 1e-9) {
        car.x += dx;
        rest = alongX;
        if (Math.abs(car.speed) / METRE > 8) car.damage = Math.min(100, (car.damage || 0) + (Math.abs(car.speed) / METRE - 8) * 0.12);
        car.speed *= 0.82;
        car.slip *= 0.5;
      } else if (alongZ !== null && Math.abs(dz) > 1e-9) {
        car.z += dz;
        rest = alongZ;
        if (Math.abs(car.speed) / METRE > 8) car.damage = Math.min(100, (car.damage || 0) + (Math.abs(car.speed) / METRE - 8) * 0.12);
        car.speed *= 0.82;
        car.slip *= 0.5;
      } else {
        rest = restingHeight(world, car, car.x, car.z, car.heading);
        const impact = Math.hypot(car.speed, car.slip) / METRE;
        if (impact > 2) car.bumped = 12;
        // Damage (spec §3.4): a hit above walking pace dents the car, more
        // the harder it is; at 100 the engine dies.
        if (impact > 3) car.damage = Math.min(100, (car.damage || 0) + (impact - 3) * 2.2);
        car.speed = 0;
        car.slip = 0;
      }
      if (rest === null) rest = car.y;
    }

    // Height: climb a step at once, follow the road down within a step, and
    // fall freely off anything higher.
    if (rest >= car.y - world.step) {
      car.y = rest;
      car.vy = 0;
      car.grounded = true;
    } else {
      car.vy -= CAR.gravity * DT;
      car.y = Math.max(rest, car.y + car.vy * DT);
      car.grounded = car.y <= rest + EPSILON;
      if (car.grounded) car.vy = 0;
    }

    // Attitude from the support under nose and tail, sides.
    const c = Math.cos(car.heading);
    const s = Math.sin(car.heading);
    const probe = (a, b) => {
      const h = supportAt(world, car.x + a * c - b * s, car.z + a * s + b * c, car.y);
      return h === -Infinity ? car.y : h;
    };
    if (car.grounded) {
      car.pitch = Math.atan2(probe(CAR.halfLength, 0) - probe(-CAR.halfLength, 0), 2 * CAR.halfLength);
      car.roll = Math.atan2(probe(0, -CAR.halfWidth) - probe(0, CAR.halfWidth), 2 * CAR.halfWidth);
    }
    return car;
  }

  // --- determinism ----------------------------------------------------------------

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fnv(hash, value) {
    const text = String(value);
    let h = hash >>> 0;
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
    return h;
  }

  function carDigest(hash, car) {
    const round = (v) => Math.round(v * 1e6);
    return fnv(hash, `${round(car.x)},${round(car.z)},${round(car.y)},${round(car.heading)},${round(car.speed)},${round(car.slip || 0)}`);
  }

  // A run from a seed and an input list: the seed picks the spawn and the
  // paint, each input is one fixed step. Same seed, same inputs, same world:
  // the same drive, digit for digit.
  function replay(world, spawns, seed, inputs) {
    const random = mulberry32(seed);
    const spawn = spawns[Math.floor(random() * spawns.length)];
    const paint = 1 + Math.floor(random() * 4);
    const car = createCar(spawn);
    let hash = 2166136261;
    for (const input of inputs) {
      stepCar(car, input, world);
      hash = carDigest(hash, car);
    }
    return { car, paint, digest: hash.toString(16).padStart(8, "0") };
  }

  // --- a drivable carriageway ---------------------------------------------------
  //
  // Bonsai City lays a road on a slope tile in blocks that lean with the
  // wedge triangle under each block's centre. Where the slope runs across the
  // road (a higher neighbour beside it, not ahead), the blocks disagree: a
  // kerb of one to three layers opens at a tile seam, or a ridge runs
  // diagonally across the carriageway where the wedge's two triangles meet.
  // From the street either one is a wall in the road. Joyride fills the low
  // side: every metre of carriageway is raised, never lowered, until no
  // neighbour stands more than half a layer per metre above it. The fill is
  // drawn by the street renderer and rasterized into the collision world, so
  // the car still meets exactly what is on screen; the Bonsai City views are
  // unchanged.

  const CARRIAGEWAY_HALF_WIDTH = 5;   // metres either side of the centre line
  const FILL_RISE_PER_METRE = 0.5;    // voxel layers
  // A road step is at most one terrain level (four layers); anything taller
  // standing in the carriageway is a thing on the road (a pole), not road.
  const FILL_MAX_RISE = 4.5;

  // The surface a car drives on in a column: a deck over water (a bridge),
  // or a deck the car could not fit under (a road block hovering over its
  // wedge); otherwise the ground. A deck with a car's height of air beneath
  // it (a cable, a crossbar) is overhead, not road.
  function roadSurface(world, x, z) {
    const cell = cellAt(world, x, z);
    if (cell < 0) return null;
    const ground = world.ground[cell];
    const deck = world.deckTop[cell];
    if (deck !== -Infinity && (world.water[cell] !== -Infinity || world.deckBottom[cell] - ground < world.carHeight)) return Math.max(ground, deck);
    return ground === -Infinity ? null : ground;
  }

  // The cells of the carriageway: within five metres of a road's centre
  // line, on the halves of each tile a road arm runs through (past the end
  // of a T the far half is kerb and verge).
  function carriagewayCells(world, snapshot) {
    const size = Number(snapshot.size) || 0;
    const road = (x, y) => x >= 0 && y >= 0 && x < size && y < size
      && Boolean(snapshot.road?.[y * size + x] || snapshot.onramp?.[y * size + x]);
    const cells = new Set();
    const side = world.side;
    const n = world.cells;
    // An avenue half is carriageway from the median out to the kerb, five
    // metres past its centre line, the whole length of the tile.
    const avenue = avenueLayer(snapshot);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!road(x, y)) continue;
        const dir = avenue?.[y * size + x];
        if (dir) {
          // As the renderer lays it: the median (2 m) is kerb and hedge, or
          // an island at a stop, except at a crossing or the avenue's end;
          // along the tile the asphalt stops 5 m past the centre where no
          // road goes on.
          const [lx, lz] = STEP[LEFT_OF[dir]];
          const [fx, fz] = STEP[dir];
          const crossing = road(x - lx, y - lz) || road(x + 2 * lx, y + 2 * lz);
          const runs = (k) => avenue[(y + fz * k) * size + (x + fx * k)] === dir && x + fx * k >= 0 && y + fz * k >= 0 && x + fx * k < size && y + fz * k < size;
          const open = crossing || !runs(1) || !runs(-1);
          const ahead = road(x + fx, y + fz), behind = road(x - fx, y - fz);
          for (let j = 0; j < n; j += 1) {
            for (let i = 0; i < n; i += 1) {
              const u = (i + 0.5) / n - 0.5, v = (j + 0.5) / n - 0.5;
              const towardMedian = u * lx + v * lz;
              const along = u * fx + v * fz;
              if (towardMedian < -CARRIAGEWAY_HALF_WIDTH * METRE) continue;
              if (!open && towardMedian > 6 * METRE) continue;
              if ((!ahead && along > CARRIAGEWAY_HALF_WIDTH * METRE) || (!behind && along < -CARRIAGEWAY_HALF_WIDTH * METRE)) continue;
              cells.add((y * n + j) * side + (x * n + i));
            }
          }
          continue;
        }
        const arms = { w: road(x - 1, y), e: road(x + 1, y), n: road(x, y - 1), s: road(x, y + 1) };
        if (!arms.w && !arms.e && !arms.n && !arms.s) arms.w = arms.e = true;
        for (let j = 0; j < n; j += 1) {
          for (let i = 0; i < n; i += 1) {
            const u = (i + 0.5) / n - 0.5; // -0.5..0.5 across x
            const v = (j + 0.5) / n - 0.5; // -0.5..0.5 across z
            const half = CARRIAGEWAY_HALF_WIDTH * METRE;
            const alongX = Math.abs(v) <= half && ((u <= 0 && arms.w) || (u >= 0 && arms.e) || Math.abs(u) <= half);
            const alongZ = Math.abs(u) <= half && ((v <= 0 && arms.n) || (v >= 0 && arms.s) || Math.abs(v) <= half);
            if ((alongX && (arms.w || arms.e)) || (alongZ && (arms.n || arms.s))) cells.add((y * n + j) * side + (x * n + i));
          }
        }
      }
    }
    return cells;
  }

  // The fill: one 1 m column per raised cell, in the renderer's block shape.
  // The colour is the road models' own asphalt (voxel palette 84, 86, 92), so a
  // ramp reads as the same street.
  function fillCarriageway(world, snapshot, colour = { r: 84 / 255, g: 86 / 255, b: 92 / 255 }) {
    const cells = carriagewayCells(world, snapshot);
    const side = world.side;
    const height = new Map();
    cells.forEach((cell) => {
      const cx = cell % side;
      const cz = Math.floor(cell / side);
      const h = roadSurface(world, (cx + 0.5) / world.cells, (cz + 0.5) / world.cells);
      if (h !== null) height.set(cell, h);
    });
    const per = world.layer * FILL_RISE_PER_METRE;
    const cap = world.layer * FILL_MAX_RISE;
    const filled = new Map(height);
    const neighbours = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    // Relax until settled: a cell rises to (neighbour - slope x distance)
    // when that neighbour is road no more than one terrain level above the
    // cell's own surface. Forward and backward raster sweeps, repeated until
    // nothing moves, so the result does not depend on any queue order.
    const order = [...height.keys()].sort((a, b) => a - b);
    for (let pass = 0; pass < 64; pass += 1) {
      let changed = false;
      const sweep = (cell) => {
        const own = height.get(cell);
        const cx = cell % side;
        const cz = Math.floor(cell / side);
        let best = filled.get(cell);
        for (const [dx, dz, distance] of neighbours) {
          const top = filled.get((cz + dz) * side + (cx + dx));
          if (top === undefined || top - own > cap) continue;
          const wanted = top - per * distance;
          if (wanted > best + 1e-6) best = wanted;
        }
        if (best > filled.get(cell)) {
          filled.set(cell, best);
          changed = true;
        }
      };
      order.forEach(sweep);
      for (let i = order.length - 1; i >= 0; i -= 1) sweep(order[i]);
      if (!changed) break;
    }
    const blocks = [];
    filled.forEach((top, cell) => {
      const base = height.get(cell);
      if (top - base < world.layer * 0.05) return;
      const cx = cell % side;
      const cz = Math.floor(cell / side);
      blocks.push({
        x: (cx + 0.5) / world.cells, z: (cz + 0.5) / world.cells,
        y: (base + top) / 2, sy: top - base, sx: 1 / world.cells, sz: 1 / world.cells,
        r: colour.r, g: colour.g, b: colour.b, a: 1, tile: null, shape: "box",
      });
    });
    return blocks;
  }

  // How the filled carriageway is drawn. The fill itself (above) is solid
  // per metre cell, which drawn as boxes reads as a flight of stairs up every
  // cross-tilted slope road. Drawn instead: each filled cell's box only up to
  // its lowest corner, and over it a quad whose corners sit at the mean height
  // of the carriageway cells sharing them (ledges taller than a terrain layer
  // are not averaged across). Collision still uses the boxes; the eye sees a
  // ramp. Call after the fill has been rasterized into the world.
  function rampSurface(world, snapshot, ramps) {
    const n = world.cells;
    const side = world.side;
    const road = carriagewayCells(world, snapshot);
    const topAt = (cx, cz) => {
      if (cx < 0 || cz < 0 || cx >= side || cz >= side) return null;
      const cell = cz * side + cx;
      if (!road.has(cell)) return null;
      return roadSurface(world, (cx + 0.5) / n, (cz + 0.5) / n);
    };
    const blocks = [];
    const positions = [];
    (Array.isArray(ramps) ? ramps : []).forEach((block) => {
      const cx = Math.floor(block.x * n);
      const cz = Math.floor(block.z * n);
      const own = block.y + block.sy / 2;
      const base = block.y - block.sy / 2;
      const corner = (i, j) => {
        let sum = 0, count = 0;
        for (const [dx, dz] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
          const h = topAt(cx + dx, cz + dz);
          if (h === null || Math.abs(h - own) > world.layer) continue;
          sum += h;
          count += 1;
        }
        return count ? sum / count : own;
      };
      const h00 = corner(0, 0), h10 = corner(1, 0), h11 = corner(1, 1), h01 = corner(0, 1);
      const floor = Math.min(h00, h10, h11, h01);
      if (floor - base > 1e-4) blocks.push({ ...block, y: (base + floor) / 2, sy: floor - base });
      const x0 = cx / n, x1 = (cx + 1) / n, z0 = cz / n, z1 = (cz + 1) / n;
      const lift = 0.0015;
      // Counter-clockwise seen from above (y up): (x0,z1) (x1,z1) (x1,z0), (x0,z1) (x1,z0) (x0,z0).
      positions.push(
        x0, h01 + lift, z1, x1, h11 + lift, z1, x1, h10 + lift, z0,
        x0, h01 + lift, z1, x1, h10 + lift, z0, x0, h00 + lift, z0,
      );
    });
    const colour = ramps && ramps[0] ? { r: ramps[0].r, g: ramps[0].g, b: ramps[0].b } : { r: 0.27, g: 0.27, b: 0.29 };
    return { blocks, positions: Float32Array.from(positions), colour };
  }

  // Where a car can start in any city: straight stretches of road (a run
  // north-south or east-west, nothing joining from the side) on dry, level
  // ground, without the power line Bonsai City plants on a road's centre
  // line. Nearest first to `from` (the tile the player was looking at), at
  // least three tiles apart, at most `limit`. A city with no such road falls
  // back to any dry road tile; a city without roads starts at its spawn
  // centre, on the ground.
  function citySpawns(snapshot, from = null, limit = 12) {
    const size = Number(snapshot.size) || 0;
    const at = (layer, x, y) => (x >= 0 && y >= 0 && x < size && y < size ? Number(snapshot[layer]?.[y * size + x]) || 0 : 0);
    const road = (x, y) => at("road", x, y) > 0 || at("onramp", x, y) > 0;
    const strict = [];
    const loose = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!road(x, y) || at("water", x, y) || at("highway", x, y)) continue;
        const ns = road(x, y - 1) && road(x, y + 1);
        const ew = road(x - 1, y) && road(x + 1, y);
        const heading = ew ? 0 : ns ? Math.PI / 2 : 0;
        loose.push({ tileX: x, tileY: y, heading });
        if (ns === ew || at("slope", x, y) || at("wire", x, y) || at("tunnel", x, y)) continue;
        if (ns && (road(x - 1, y) || road(x + 1, y))) continue;
        if (ew && (road(x, y - 1) || road(x, y + 1))) continue;
        strict.push({ tileX: x, tileY: y, heading });
      }
    }
    // Junctions (three or more arms) carry traffic lights. A start keeps
    // three tiles clear of them where the town allows, and faces away from
    // the nearer one, so the first seconds are not a red light (Basin J1).
    const junction = (x, y) => road(x, y) && [road(x - 1, y), road(x + 1, y), road(x, y - 1), road(x, y + 1)].filter(Boolean).length >= 3;
    const clearance = (spawn, dx, dy) => {
      for (let k = 1; k <= 8; k += 1) {
        const x = spawn.tileX + dx * k, y = spawn.tileY + dy * k;
        if (!road(x, y)) return 99;
        if (junction(x, y)) return k;
      }
      return 99;
    };
    strict.forEach((spawn) => {
      const ew = spawn.heading === 0;
      const ahead = ew ? clearance(spawn, 1, 0) : clearance(spawn, 0, 1);
      const behind = ew ? clearance(spawn, -1, 0) : clearance(spawn, 0, -1);
      spawn.clear = Math.min(ahead, behind);
      // Face the longer clear run: away from the nearer junction.
      if (ahead >= behind) spawn.heading = ew ? 0 : Math.PI / 2;
      else spawn.heading = ew ? Math.PI : -Math.PI / 2;
    });
    const roomy = strict.filter((spawn) => spawn.clear >= 3);
    const pool = roomy.length ? roomy : strict.length ? strict : loose;
    if (!pool.length) {
      const centre = snapshot.spawnCenter || { x: Math.floor(size / 2), y: Math.floor(size / 2) };
      return [{ tileX: Math.max(0, Math.min(size - 1, Math.round(centre.x))), tileY: Math.max(0, Math.min(size - 1, Math.round(centre.y))), heading: 0 }];
    }
    const origin = from && Number.isFinite(from.x) && Number.isFinite(from.y) ? from : null;
    const ordered = origin
      ? [...pool].sort((a, b) => (Math.hypot(a.tileX - origin.x, a.tileY - origin.y) - Math.hypot(b.tileX - origin.x, b.tileY - origin.y)) || (a.tileY - b.tileY) || (a.tileX - b.tileX))
      : pool;
    const chosen = [];
    for (const spawn of ordered) {
      if (chosen.every((other) => Math.max(Math.abs(other.tileX - spawn.tileX), Math.abs(other.tileY - spawn.tileY)) >= 3)) chosen.push(spawn);
      if (chosen.length >= limit) break;
    }
    return chosen;
  }

  // --- avenues, bus lanes and stops (the Basin avenue layer) -------------------------
  //
  // An avenue is two road tiles side by side, one carriageway each way, with
  // a median between them; Yichang's and Guangzhou's BRT run in that median
  // and stop at island platforms in it. The `avenue` layer holds, for each
  // half, the way its traffic runs (1 north, 2 east, 4 south, 8 west), so the
  // median is always on the driver's left and the other half is the tile to
  // the left. A half whose other half does not answer it is an ordinary road.
  const STEP = Object.freeze({ 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] });
  const LEFT_OF = Object.freeze({ 1: 8, 2: 1, 4: 2, 8: 4 });
  const BACK = Object.freeze({ 1: 4, 2: 8, 4: 1, 8: 2 });

  function avenuePartner(size, tile, dir) {
    const [dx, dz] = STEP[LEFT_OF[dir]];
    const x = (tile % size) + dx, y = Math.floor(tile / size) + dz;
    return x >= 0 && y >= 0 && x < size && y < size ? y * size + x : -1;
  }

  function avenueLayer(snapshot) {
    const size = Number(snapshot.size) || 0;
    const source = snapshot.avenue;
    if (!source || !size) return null;
    const road = (i) => Number(snapshot.road?.[i]) > 0;
    const out = new Uint8Array(size * size);
    let any = false;
    for (let i = 0; i < size * size; i += 1) {
      const dir = Number(source[i]) || 0;
      if (!LEFT_OF[dir] || !road(i)) continue;
      const partner = avenuePartner(size, i, dir);
      if (partner < 0 || !road(partner) || Number(source[partner]) !== BACK[dir]) continue;
      out[i] = dir;
      any = true;
    }
    return any ? out : null;
  }

  // The street's own copy of a snapshot: the avenue layer checked, and the
  // bus lanes and stops a Rootline plan implies when the snapshot does not
  // carry them already. A BRT lane on an avenue is its median busway, both
  // ways; a stop there is an island platform on both halves (2). Anywhere
  // else a bus stops at the kerb (1).
  function streetLayers(snapshot, transit = null) {
    const size = Number(snapshot.size) || 0;
    const avenue = avenueLayer(snapshot);
    const plans = Array.isArray(transit?.lines) ? transit.lines.filter((plan) => plan?.mode === "bus" || plan?.mode === "brt") : [];
    const indexOf = (x, y) => (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size ? y * size + x : -1);
    let busLane = snapshot.busLane ? Uint8Array.from(snapshot.busLane) : null;
    if (!busLane && plans.some((plan) => plan.mode === "brt")) {
      busLane = new Uint8Array(size * size);
      plans.filter((plan) => plan.mode === "brt").forEach((plan) => {
        const tiles = Array.isArray(plan.tiles) ? plan.tiles : [];
        for (let i = 0; i + 1 < tiles.length; i += 2) {
          const tile = indexOf(tiles[i], tiles[i + 1]);
          if (tile >= 0 && Number(snapshot.road?.[tile]) > 0) busLane[tile] = 1;
        }
      });
    }
    if (busLane && avenue) {
      for (let i = 0; i < size * size; i += 1) if (busLane[i] && avenue[i]) busLane[avenuePartner(size, i, avenue[i])] = 1;
    }
    let busStop = snapshot.busStop ? Uint8Array.from(snapshot.busStop) : null;
    const stopsOf = (plan) => (Array.isArray(plan?.stops) ? plan.stops : Array.isArray(plan?.stations) ? plan.stations : []);
    if (!busStop && plans.some((plan) => stopsOf(plan).length)) {
      busStop = new Uint8Array(size * size);
      plans.forEach((plan) => stopsOf(plan).forEach((stop) => {
        const tile = indexOf(stop?.x, stop?.y);
        if (tile < 0) return;
        if (plan.mode === "brt" && avenue?.[tile]) {
          busStop[tile] = 2;
          busStop[avenuePartner(size, tile, avenue[tile])] = 2;
        } else if (!busStop[tile]) busStop[tile] = 1;
      }));
    }
    return { ...snapshot, avenue, busLane, busStop };
  }

  // Spawn points in world units, resting on whatever the world says is there.
  function spawnPoints(world, recipe = { spawns: [] }) {
    return (Array.isArray(recipe?.spawns) ? recipe.spawns : []).map((spawn) => {
      // The right-hand lane: 2 m right of the centre line (the kerb side
      // of the carriageway is the non-motor lane).
      const x = spawn.tileX + 0.5 - Math.sin(spawn.heading) * 2 * METRE;
      const z = spawn.tileY + 0.5 + Math.cos(spawn.heading) * 2 * METRE;
      // The top surface of the column: a bridge deck when there is one (the
      // ground under a deck is the river bed), the ground otherwise.
      const cell = cellAt(world, x, z);
      const ground = cell >= 0 && world.ground[cell] !== -Infinity ? world.ground[cell] : 0;
      const y = cell >= 0 && world.deckTop[cell] !== -Infinity ? Math.max(ground, world.deckTop[cell]) : ground;
      return Object.freeze({ x, z, y, heading: spawn.heading });
    });
  }

  global.AISystem6JoyrideCore = Object.freeze({
    PALETTE, DEPTHS, RESOLUTIONS, CELLS, STEP_HZ, DT, METRE, CAR,
    macSystemPalette, nearestPaletteIndex, quantize256, quantizeThousands, ditherAtkinson, convertFrame,
    createStreetWorld, applySpan, modelColumnRuns, rasterizeChunk, cellAt, supportAt, blockedAt,
    createCar, stepCar, carIsClear, boxesOverlap, footprintReport, replay, mulberry32, spawnPoints,
    roadSurface, carriagewayCells, fillCarriageway, rampSurface, citySpawns,
    avenueLayer, avenuePartner, streetLayers,
  });
})(window);
