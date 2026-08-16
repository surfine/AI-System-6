// Builds the Micropolis HD (2x) atlases from the committed 1x vendor art.
//
// Single source of truth: apps/desktop/app/vendor/micropolis/{tiles,tilessnow,
// sprites}.png (the upstream-pinned 16px art). This script derives the @2x
// runtime atlases from them deterministically — same input bytes, same output
// bytes — so the HD art is reproducible and never hand-edited.
//
// The remaster is not a naive upscale. Each 16px cell goes through:
//   1. Edge reconstruction (Scale2x on exact RGBA, cell-clamped so a tile
//      never samples its atlas neighbour — that would bleed unrelated art
//      across tile seams).
//   2. Dither refinement: the original art textures large faces with 1px
//      checkerboard dithering. Those regions are re-dithered at HD pixel
//      pitch (twice the frequency), which reads as real added resolution
//      while keeping the classic material character.
//   3. Material texturing: palette-classified detail — grass and tree grain,
//      water ripple bands, asphalt and roof speckle, dirt pebbles — applied
//      per HD pixel with a deterministic position hash.
//   4. Bevel lighting: a consistent top-left light source; color-region
//      boundaries get a subtle highlight above/left and shade below/right,
//      giving buildings and roads relief. Dithered regions and pure black
//      outlines are excluded, and cell borders never bevel, so multi-tile
//      buildings and road/rail/wire runs stay seamless.
//
// Outputs (committed): tiles@2x.png, tilessnow@2x.png (1024x1024) and
// sprites@2x.png (1536x768) beside the originals. The engine's TileSet
// accepts any integer multiple of the 512px base and reports its scale;
// GameCanvas renders the backing store at that scale (see
// tooling/vendor/micropolis-hd-patch.mjs and the vendor NOTICE).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { desktopRoot, repositoryRoot } from "./lib/paths.mjs";

const require = createRequire(join(repositoryRoot, "package.json"));
const { createCanvas, loadImage } = require("canvas");

const vendorDir = join(desktopRoot, "app", "vendor", "micropolis");
const SCALE = 2;

// --- deterministic hash / noise ---------------------------------------------

function hash01(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Bilinear value noise on a lattice with the given period, in [0, 1).
function smoothNoise(x, y, period, seed) {
  const gx = Math.floor(x / period);
  const gy = Math.floor(y / period);
  const fx = x / period - gx;
  const fy = y / period - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash01(gx, gy, seed);
  const n10 = hash01(gx + 1, gy, seed);
  const n01 = hash01(gx, gy + 1, seed);
  const n11 = hash01(gx + 1, gy + 1, seed);
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
}

// --- palette classification ---------------------------------------------------

const MATERIALS = [
  { name: "grass", rgb: [0, 230, 0] },
  { name: "trees", rgb: [0, 127, 0] },
  { name: "dirt", rgb: [204, 127, 102] },
  { name: "wood", rgb: [153, 127, 76] },
  { name: "asphalt", rgb: [63, 63, 63] },
  { name: "roofMid", rgb: [127, 127, 127] },
  { name: "roofLight", rgb: [191, 191, 191] },
  { name: "waterLight", rgb: [102, 102, 230] },
  { name: "waterDeep", rgb: [0, 0, 230] },
];

function materialOf(r, g, b) {
  for (const m of MATERIALS) {
    if (m.rgb[0] === r && m.rgb[1] === g && m.rgb[2] === b) return m.name;
  }
  return null;
}

// Per-material luminance factor for an HD pixel (cell-local coordinates keep
// repeated tiles identical, matching how the original art repeats).
function materialFactor(name, x, y) {
  switch (name) {
    case "grass":
      return (smoothNoise(x, y, 5, 11) - 0.5) * 0.13
        + (hash01(x, y, 12) < 0.05 ? -0.10 : 0);
    case "trees":
      return (smoothNoise(x, y, 7, 21) - 0.5) * 0.22
        + (hash01(x, y, 22) < 0.05 ? 0.10 : 0);
    case "dirt":
      return (smoothNoise(x, y, 6, 31) - 0.5) * 0.10
        + (hash01(x, y, 32) < 0.04 ? -0.09 : 0);
    case "wood":
      // Grain follows x so rail sleepers and lot fronts read as planks.
      return (smoothNoise(x * 0.35, y, 4, 41) - 0.5) * 0.12;
    case "asphalt":
      return (hash01(x, y, 51) - 0.5) * 0.09;
    case "roofMid":
    case "roofLight":
      return (hash01(x, y, 61) - 0.5) * 0.07;
    case "waterLight":
    case "waterDeep": {
      const ripple = Math.sin((y + smoothNoise(x, y, 9, 71) * 7 + x * 0.35) * 0.85);
      return ripple * 0.07 + (smoothNoise(x, y, 11, 72) - 0.5) * 0.05;
    }
    default:
      return 0;
  }
}

// --- per-cell HD processing ---------------------------------------------------

// cell: Uint32Array (w*w) of RGBA32 (native little-endian: ABGR in the int).
// Returns { hd: Uint32Array ((w*S)^2), dither: Uint8Array on HD grid }.
function processCell(cell, w, options) {
  const { freezeRing } = options;
  const W = w * SCALE;
  const at = (x, y) => {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const cy = y < 0 ? 0 : y >= w ? w - 1 : y;
    return cell[cy * w + cx];
  };

  // Checkerboard-dither detection on the base grid: orthogonal neighbours
  // disagree, diagonal neighbours agree. Border pixels of the cell never
  // count (clamping fabricates agreement there).
  const baseDither = new Uint8Array(w * w);
  const partner = new Uint32Array(w * w);
  for (let y = 1; y < w - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = at(x, y);
      const orth = [at(x, y - 1), at(x - 1, y), at(x + 1, y), at(x, y + 1)];
      const diag = [at(x - 1, y - 1), at(x + 1, y - 1), at(x - 1, y + 1), at(x + 1, y + 1)];
      const orthDiff = orth.filter((c) => c !== p).length;
      const diagSame = diag.filter((c) => c === p).length;
      if (orthDiff === 4 && diagSame >= 3) {
        // All four orthogonal neighbours must agree on the partner colour.
        if (orth[0] === orth[1] && orth[1] === orth[2] && orth[2] === orth[3]) {
          baseDither[y * w + x] = 1;
          partner[y * w + x] = orth[0];
        }
      }
    }
  }
  // No partner-phase propagation: in a true checkerboard both phases pass
  // the strict test on their own, and marking neighbours here would eat one
  // pixel into the solid regions that border a dithered area.

  // Scale2x with cell-clamped sampling.
  const hd = new Uint32Array(W * W);
  const hdDither = new Uint8Array(W * W);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const P = at(x, y);
      const B = at(x, y - 1);
      const D = at(x - 1, y);
      const F = at(x + 1, y);
      const H = at(x, y + 1);
      const isDither = baseDither[y * w + x] === 1;
      let e0 = P;
      let e1 = P;
      let e2 = P;
      let e3 = P;
      if (!isDither && B !== H && D !== F) {
        e0 = D === B ? D : P;
        e1 = B === F ? F : P;
        e2 = D === H ? D : P;
        e3 = H === F ? F : P;
      }
      const hx = x * 2;
      const hy = y * 2;
      hd[hy * W + hx] = e0;
      hd[hy * W + hx + 1] = e1;
      hd[(hy + 1) * W + hx] = e2;
      hd[(hy + 1) * W + hx + 1] = e3;
      if (isDither) {
        // Re-dither at HD pitch: twice the checkerboard frequency, globally
        // phase-aligned so neighbouring cells continue the pattern.
        const Q = partner[y * w + x];
        hd[hy * W + hx] = P;
        hd[hy * W + hx + 1] = Q;
        hd[(hy + 1) * W + hx] = Q;
        hd[(hy + 1) * W + hx + 1] = P;
        hdDither[hy * W + hx] = 1;
        hdDither[hy * W + hx + 1] = 1;
        hdDither[(hy + 1) * W + hx] = 1;
        hdDither[(hy + 1) * W + hx + 1] = 1;
      }
    }
  }

  // Freeze the outermost HD ring to the plain nearest-neighbour value so the
  // interface columns of connecting tiles (roads, rails, wires, coastlines,
  // multi-tile buildings) stay byte-identical across every seam.
  if (freezeRing) {
    for (let i = 0; i < W; i++) {
      for (const [hx, hy] of [[i, 0], [i, W - 1], [0, i], [W - 1, i]]) {
        if (hdDither[hy * W + hx]) continue;
        hd[hy * W + hx] = at(hx >> 1, hy >> 1);
      }
    }
  }

  return { hd, hdDither };
}

function applyLightAndMaterials(hd, hdDither, W, options) {
  const { materials, bevel } = options;
  const out = new Uint32Array(hd);
  const view = new DataView(out.buffer);
  const src = new DataView(hd.buffer);

  const rgbaAt = (x, y) => {
    const cx = x < 0 ? 0 : x >= W ? W - 1 : x;
    const cy = y < 0 ? 0 : y >= W ? W - 1 : y;
    return hd[cy * W + cx];
  };

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = src.getUint8(i);
      const g = src.getUint8(i + 1);
      const b = src.getUint8(i + 2);
      const a = src.getUint8(i + 3);
      if (a === 0) continue;
      if (hdDither[y * W + x]) continue;
      // Pure black stays pure: outlines, windows, void.
      if (r === 0 && g === 0 && b === 0) continue;

      let factor = 0;
      if (materials) {
        const m = materialOf(r, g, b);
        if (m) factor += materialFactor(m, x, y);
      }
      if (bevel) {
        const p = hd[y * W + x];
        const up = rgbaAt(x, y - 1);
        const left = rgbaAt(x - 1, y);
        const down = rgbaAt(x, y + 1);
        const right = rgbaAt(x + 1, y);
        const ditherNear = (nx, ny) => {
          const cx = nx < 0 ? 0 : nx >= W ? W - 1 : nx;
          const cy = ny < 0 ? 0 : ny >= W ? W - 1 : ny;
          return hdDither[cy * W + cx] === 1;
        };
        const lit = (up !== p && !ditherNear(x, y - 1)) || (left !== p && !ditherNear(x - 1, y));
        const shaded = (down !== p && !ditherNear(x, y + 1)) || (right !== p && !ditherNear(x + 1, y));
        if (lit && !shaded) factor += 0.10;
        else if (shaded && !lit) factor -= 0.10;
      }
      if (factor === 0) continue;
      const scale = 1 + factor;
      view.setUint8(i, Math.max(0, Math.min(255, Math.round(r * scale))));
      view.setUint8(i + 1, Math.max(0, Math.min(255, Math.round(g * scale))));
      view.setUint8(i + 2, Math.max(0, Math.min(255, Math.round(b * scale))));
    }
  }
  return out;
}

// --- atlas assembly -----------------------------------------------------------

async function buildAtlas(inputName, outputName, cellSize, options) {
  const image = await loadImage(join(vendorDir, inputName));
  const cols = image.width / cellSize;
  const rows = image.height / cellSize;
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) {
    throw new Error(`${inputName}: dimensions ${image.width}x${image.height} do not divide by ${cellSize}`);
  }

  const srcCanvas = createCanvas(image.width, image.height);
  const srcCtx = srcCanvas.getContext("2d");
  srcCtx.drawImage(image, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, image.width, image.height);
  const srcPixels = new Uint32Array(srcData.data.buffer);

  const outW = image.width * SCALE;
  const outH = image.height * SCALE;
  const outCanvas = createCanvas(outW, outH);
  const outCtx = outCanvas.getContext("2d");
  const outData = outCtx.createImageData(outW, outH);
  const outPixels = new Uint32Array(outData.data.buffer);

  const cell = new Uint32Array(cellSize * cellSize);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      for (let y = 0; y < cellSize; y++) {
        for (let x = 0; x < cellSize; x++) {
          cell[y * cellSize + x] = srcPixels[(cy * cellSize + y) * image.width + cx * cellSize + x];
        }
      }
      const { hd, hdDither } = processCell(cell, cellSize, options);
      const lit = applyLightAndMaterials(hd, hdDither, cellSize * SCALE, options);
      const W = cellSize * SCALE;
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          outPixels[(cy * W + y) * outW + cx * W + x] = lit[y * W + x];
        }
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  writeFileSync(join(vendorDir, outputName), outCanvas.toBuffer("image/png"));
  console.log(`micropolis hd: wrote ${outputName} (${outW}x${outH})`);
}

await buildAtlas("tiles.png", "tiles@2x.png", 16, { freezeRing: true, materials: true, bevel: true });
await buildAtlas("tilessnow.png", "tilessnow@2x.png", 16, { freezeRing: true, materials: true, bevel: true });
await buildAtlas("sprites.png", "sprites@2x.png", 48, { freezeRing: false, materials: false, bevel: true });
