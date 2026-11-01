// Deterministic CPU rasterizer for the SC2K tier. A voxel projects onto the
// game's 64×32 tile exactly: 16 voxels span a tile edge, so one voxel is a
// 4×2-pixel diamond on top, and a vertical voxel is 2.5 px (an altitude step
// of 10 px is four voxels). Screen position uses only additions and halves:
//   sx = 2 (X − Y)        sy = (X + Y) − 2.5 Z
// so every machine produces the same bytes — no GPU, no trigonometry.
// Faces are sampled at pixel centres with half-open face-local ranges, so
// neighbouring faces tile without gaps or double cover; a depth buffer
// (d = X + Y + 0.8 Z, larger is nearer) resolves overlap, and a final pass
// draws the 1-pixel outline where a surface stands in front of a farther one.

import { MATERIALS, MATERIAL_INDEX, voxelShade, hash3 } from "./voxel.mjs";

const FACE_TOP = 1.0;
const FACE_LEFT = 0.84;  // +Y faces, lower-left on screen
const FACE_RIGHT = 0.68; // +X faces, lower-right on screen
const Z_PX = 2.5;
const DEPTH_Z = 0.8;
const OUTLINE_DEPTH = 1.6;

const WINDOW = MATERIAL_INDEX.get("window");
const WINDOW_LIT = MATERIAL_INDEX.get("windowlit");
const GLASS = MATERIAL_INDEX.get("glass");
const GLASS_DARK = MATERIAL_INDEX.get("glassdark");
const LAMP = MATERIAL_INDEX.get("lamp");

// Night: most windows glow (deterministically) and lamps glow; everything
// else keeps its day colour because the renderer's lighting layer dims the
// whole scene at night — darkening here too would darken it twice. Glass
// curtain walls light floor by floor.
function nightColour(material, rgb, x, y, z) {
  const glow = material === WINDOW_LIT || material === LAMP
    || ((material === WINDOW || material === GLASS || material === GLASS_DARK) && hash3(x >> 1, y >> 1, Math.floor(z / 3)) < 0.62);
  if (glow) return [255, 214, 138];
  return rgb;
}

// Smooth surfaces (terrain) arrive as triangles in voxel space, each with an
// RGB colour. Shading follows the same screen-fixed light as voxel faces:
// flat ground is FACE_TOP, a surface facing +Y reads like a left face, +X like
// a right face, and slopes turned toward the upper left are a touch brighter.
export function surfaceShade(nx, ny, nz) {
  const sum = Math.abs(nx) + Math.abs(ny) + Math.abs(nz) || 1;
  return (nz * FACE_TOP + Math.max(0, ny) * FACE_LEFT + Math.max(0, nx) * FACE_RIGHT
    + Math.max(0, -nx) * 1.08 + Math.max(0, -ny) * 1.04) / sum;
}

function drawTriangles(triangles, { plot, ox, oy }) {
  for (const { p, rgb } of triangles) {
    const s = p.map(([X, Y, Z]) => [2 * (X - Y), X + Y - Z_PX * Z, X + Y + DEPTH_Z * Z]);
    const area = (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) - (s[2][0] - s[0][0]) * (s[1][1] - s[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    const minX = Math.floor(Math.min(s[0][0], s[1][0], s[2][0]) + ox);
    const maxX = Math.ceil(Math.max(s[0][0], s[1][0], s[2][0]) + ox);
    const minY = Math.floor(Math.min(s[0][1], s[1][1], s[2][1]) + oy);
    const maxY = Math.ceil(Math.max(s[0][1], s[1][1], s[2][1]) + oy);
    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const x = px + 0.5 - ox;
        const y = py + 0.5 - oy;
        const w0 = ((s[1][0] - x) * (s[2][1] - y) - (s[2][0] - x) * (s[1][1] - y)) / area;
        const w1 = ((s[2][0] - x) * (s[0][1] - y) - (s[0][0] - x) * (s[2][1] - y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        plot(px, py, w0 * s[0][2] + w1 * s[1][2] + w2 * s[2][2], rgb[0], rgb[1], rgb[2]);
      }
    }
  }
}

/**
 * Render a model into an RGBA buffer of `width × height` whose pixel
 * (anchorX, anchorY) is the centre of the model's footprint at its base
 * (voxel plane Z = 0). Returns the pixel buffer.
 */
export function rasterize(model, { width, height, anchorX, anchorY, night = false, triangles = null, footprint = null, outline = true }) {
  const { w, d, h, data } = model || { w: footprint.w, d: footprint.d, h: 0, data: new Uint8Array(0) };
  const colour = new Float32Array(width * height * 3);
  const depth = new Float64Array(width * height).fill(-Infinity);
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= w || y >= d || z >= h ? 0 : data[x + w * (y + d * z)]);
  // projected coordinates of the anchor: footprint centre at Z = 0
  const ax = 2 * (w / 2 - d / 2);
  const ay = w / 2 + d / 2;
  const ox = anchorX - ax;
  const oy = anchorY - ay;

  const plot = (px, py, dd, r, g, b) => {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const i = py * width + px;
    if (dd <= depth[i]) return;
    depth[i] = dd;
    colour[i * 3] = r;
    colour[i * 3 + 1] = g;
    colour[i * 3 + 2] = b;
  };

  for (let z = 0; z < h; z += 1) {
    for (let y = 0; y < d; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const m = data[x + w * (y + d * z)];
        if (!m) continue;
        const top = !at(x, y, z + 1);
        const left = !at(x, y + 1, z);
        const right = !at(x + 1, y, z);
        if (!top && !left && !right) continue;
        const mat = MATERIALS[m];
        const shade = voxelShade(m, x, y, z);
        let base = [mat.rgb[0] * shade, mat.rgb[1] * shade, mat.rgb[2] * shade];
        if (night) base = nightColour(m, base, x, y, z);
        if (top) {
          // A top face tucked against a wall behind it reads darker.
          const tucked = at(x - 1, y, z + 1) || at(x, y - 1, z + 1) ? 0.88 : 1;
          const k = FACE_TOP * tucked;
          const zt = z + 1;
          // screen bbox of the diamond
          const cx = 2 * (x - y) + ox;
          const cy = x + y - Z_PX * zt + oy;
          for (let py = Math.floor(cy); py <= Math.ceil(cy + 2); py += 1) {
            for (let px = Math.floor(cx - 2); px <= Math.ceil(cx + 2); px += 1) {
              const sx = px + 0.5 - ox;
              const sy = py + 0.5 - oy;
              const a = sx / 2;
              const b2 = sy + Z_PX * zt;
              const X = (a + b2) / 2;
              const Y = (b2 - a) / 2;
              if (X < x || X >= x + 1 || Y < y || Y >= y + 1) continue;
              plot(px, py, X + Y + DEPTH_Z * zt, base[0] * k, base[1] * k, base[2] * k);
            }
          }
        }
        if (left) {
          const Yp = y + 1;
          const cx = 2 * (x - Yp) + ox;
          const cyTop = x + Yp - Z_PX * (z + 1) + oy;
          for (let py = Math.floor(cyTop); py <= Math.ceil(cyTop + 1 + Z_PX); py += 1) {
            for (let px = Math.floor(cx); px <= Math.ceil(cx + 2); px += 1) {
              const sx = px + 0.5 - ox;
              const sy = py + 0.5 - oy;
              const X = sx / 2 + Yp;
              const Z = (X + Yp - sy) / Z_PX;
              if (X < x || X >= x + 1 || Z < z || Z >= z + 1) continue;
              plot(px, py, X + Yp + DEPTH_Z * Z, base[0] * FACE_LEFT, base[1] * FACE_LEFT, base[2] * FACE_LEFT);
            }
          }
        }
        if (right) {
          const Xp = x + 1;
          const cx = 2 * (Xp - y) + ox;
          const cyTop = Xp + y - Z_PX * (z + 1) + oy;
          for (let py = Math.floor(cyTop); py <= Math.ceil(cyTop + 1 + Z_PX); py += 1) {
            for (let px = Math.floor(cx - 2); px <= Math.ceil(cx); px += 1) {
              const sx = px + 0.5 - ox;
              const sy = py + 0.5 - oy;
              const Y = Xp - sx / 2;
              const Z = (Xp + Y - sy) / Z_PX;
              if (Y < y || Y >= y + 1 || Z < z || Z >= z + 1) continue;
              plot(px, py, Xp + Y + DEPTH_Z * Z, base[0] * FACE_RIGHT, base[1] * FACE_RIGHT, base[2] * FACE_RIGHT);
            }
          }
        }
      }
    }
  }

  if (triangles) drawTriangles(triangles, { plot, ox, oy });

  const out = Buffer.alloc(width * height * 4);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const i = py * width + px;
      if (depth[i] === -Infinity) continue;
      let k = 1;
      const dd = depth[i];
      if (outline) {
      const n = [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]];
      for (const [qx, qy] of n) {
        const qd = qx < 0 || qy < 0 || qx >= width || qy >= height ? -Infinity : depth[qy * width + qx];
        if (qd === -Infinity || qd < dd - OUTLINE_DEPTH) { k = 0.56; break; }
      }
      }
      out[i * 4] = Math.max(0, Math.min(255, Math.round(colour[i * 3] * k)));
      out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(colour[i * 3 + 1] * k)));
      out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(colour[i * 3 + 2] * k)));
      out[i * 4 + 3] = 255;
    }
  }
  return out;
}
