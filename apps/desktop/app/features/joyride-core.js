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
    fastSteer: 0.14,
    steerRate: 3.2,
  });

  // Sample points over the car's footprint, in its own frame (nose +x).
  const FOOTPRINT = Object.freeze([
    [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1], [0, 0],
  ].map(([a, b]) => Object.freeze([a * CAR.halfLength, b * CAR.halfWidth])));

  function createCar(spawn) {
    return {
      x: spawn.x, z: spawn.z, y: spawn.y,
      heading: spawn.heading || 0,
      speed: 0, steer: 0, vy: 0,
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
    return { rest, body, points, supports, blocked };
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
  function stepCar(car, input, world) {
    const throttle = clamp(Number(input?.throttle) || 0, 0, 1);
    const brake = clamp(Number(input?.brake) || 0, 0, 1);
    const steerInput = clamp(Number(input?.steer) || 0, -1, 1);
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
    let speed = car.speed + accel * DT;
    // Rolling resistance and drag pull toward a standstill, never past it.
    const fade = (CAR.rolling + CAR.drag * speed * speed) * DT;
    speed = Math.abs(speed) <= fade ? 0 : speed - Math.sign(speed) * fade;
    car.speed = clamp(speed, -CAR.reverseSpeed, CAR.topSpeed);

    // Turning never swings the body into a wall: a turn that would is held.
    if (car.grounded && car.speed !== 0) {
      const heading = car.heading + (car.speed / CAR.wheelbase) * Math.tan(car.steer) * DT;
      if (restingHeight(world, car, car.x, car.z, heading) !== null) car.heading = heading;
    }
    const dx = Math.cos(car.heading) * car.speed * DT;
    const dz = Math.sin(car.heading) * car.speed * DT;

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
        car.speed *= 0.82;
      } else if (alongZ !== null && Math.abs(dz) > 1e-9) {
        car.z += dz;
        rest = alongZ;
        car.speed *= 0.82;
      } else {
        rest = restingHeight(world, car, car.x, car.z, car.heading);
        if (Math.abs(car.speed) > 2 * METRE) car.bumped = 12;
        car.speed = 0;
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
    return fnv(hash, `${round(car.x)},${round(car.z)},${round(car.y)},${round(car.heading)},${round(car.speed)}`);
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

  // --- the demonstration city ---------------------------------------------------------

  // Starter Town as Bonsai City's example replays it, plus five roads laid
  // after the replay: a 21-tile bridge across the lake east of the grid, the
  // far shore, a road back along the south, and a climb over the hill to the
  // south-west. The roads are ordinary build-path commands the simulation
  // accepts and costs; nothing about the city is edited by hand.
  const DEMO_CITY = Object.freeze({
    id: "joyride-demo",
    base: "starter-town",
    roads: Object.freeze([
      Object.freeze({ id: "bridge", points: Object.freeze([{ x: 35, y: 28 }, { x: 60, y: 28 }]) }),
      Object.freeze({ id: "far-shore", points: Object.freeze([{ x: 60, y: 28 }, { x: 60, y: 38 }]) }),
      Object.freeze({ id: "south", points: Object.freeze([{ x: 60, y: 38 }, { x: 31, y: 38 }]) }),
      Object.freeze({ id: "back", points: Object.freeze([{ x: 31, y: 38 }, { x: 31, y: 35 }]) }),
      Object.freeze({ id: "hill", points: Object.freeze([{ x: 21, y: 35 }, { x: 21, y: 58 }]) }),
    ]),
    // Where the car can start: straight stretches of road without the power
    // line (Bonsai City plants its poles on the road's centre line), facing
    // along the road and parked in the right-hand lane.
    spawns: Object.freeze([
      Object.freeze({ tileX: 18, tileY: 25, heading: 0 }),
      Object.freeze({ tileX: 25, tileY: 32, heading: Math.PI }),
      Object.freeze({ tileX: 17, tileY: 21, heading: 0 }),
      Object.freeze({ tileX: 44, tileY: 28, heading: 0 }),
      Object.freeze({ tileX: 45, tileY: 38, heading: Math.PI }),
    ]),
  });

  // Builds the city in memory from the simulation's own replay. Returns the
  // simulation state; the caller reads it through buildRenderSnapshot only.
  function buildDemoCity(sim, recipe = DEMO_CITY) {
    const state = sim.replayExampleCity(recipe.base);
    recipe.roads.forEach((road) => {
      const result = sim.submitCommand(state, {
        schemaVersion: 2,
        type: "build-path",
        payload: { network: "road", points: road.points.map((point) => ({ ...point })) },
        targetTick: state.tick,
        clientCommandId: `${recipe.id}-${road.id}`,
      });
      if (!result || !result.accepted) throw new Error(`joyride-demo-road:${road.id}:${result && result.code}`);
    });
    return state;
  }

  // Spawn points in world units, resting on whatever the world says is there.
  function spawnPoints(world, recipe = DEMO_CITY) {
    return recipe.spawns.map((spawn) => {
      // The right-hand lane: 2.5 m right of the centre line.
      const x = spawn.tileX + 0.5 - Math.sin(spawn.heading) * 2.5 * METRE;
      const z = spawn.tileY + 0.5 + Math.cos(spawn.heading) * 2.5 * METRE;
      const cell = cellAt(world, x, z);
      const y = cell >= 0 && world.ground[cell] !== -Infinity ? world.ground[cell] : 0;
      return Object.freeze({ x, z, y, heading: spawn.heading });
    });
  }

  global.AISystem6JoyrideCore = Object.freeze({
    PALETTE, DEPTHS, RESOLUTIONS, CELLS, STEP_HZ, DT, METRE, CAR, DEMO_CITY,
    macSystemPalette, nearestPaletteIndex, quantize256, quantizeThousands, ditherAtkinson, convertFrame,
    createStreetWorld, applySpan, modelColumnRuns, rasterizeChunk, cellAt, supportAt, blockedAt,
    createCar, stepCar, carIsClear, footprintReport, replay, mulberry32, buildDemoCity, spawnPoints,
  });
})(window);
