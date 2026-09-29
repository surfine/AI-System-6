// Bonsai City miniature art: the voxel model format shared by both render
// tiers. A tile edge is TILE_VOXELS voxels and a storey is STOREY voxels, so a
// building authored here reads at the same scale in the SC2K pixel tier and in
// the tilt-shift hybrid tier. Everything is deterministic: no Math.random.

export const TILE_VOXELS = 16;
export const STOREY = 3;

// Materials are colours, not textures. `jitter` is the per-voxel brightness
// spread that makes a surface read as hand-built; `pattern` adds a coursing
// rhythm (brick bonds, corrugation, planks) without a texture sheet.
const MATERIAL_TABLE = [
  // walls
  ["cream", [238, 224, 192], 0.03],
  ["limestone", [218, 207, 182], 0.03],
  ["plaster", [242, 240, 232], 0.02],
  ["brick", [172, 82, 60], 0.06, "brick"],
  ["darkbrick", [128, 62, 50], 0.06, "brick"],
  ["salmon", [232, 160, 128], 0.03],
  ["mint", [176, 214, 192], 0.03],
  ["sky", [160, 198, 222], 0.03],
  ["butter", [242, 214, 142], 0.03],
  ["concrete", [196, 194, 186], 0.03],
  ["darkconcrete", [142, 142, 140], 0.04],
  ["corrugated", [178, 186, 190], 0.02, "corrugated"],
  ["corrugatedblue", [104, 138, 172], 0.02, "corrugated"],
  ["firebrick", [186, 64, 50], 0.05, "brick"],
  ["wood", [160, 112, 72], 0.05, "planks"],
  // roofs
  ["roofred", [184, 74, 54], 0.05, "tiles"],
  ["roofslate", [96, 108, 126], 0.05, "tiles"],
  ["roofgreen", [98, 136, 104], 0.05, "tiles"],
  ["roofbrown", [136, 94, 64], 0.05, "tiles"],
  ["gravel", [158, 156, 146], 0.06],
  ["roofdark", [86, 88, 96], 0.04],
  ["roofglass", [150, 196, 214], 0.02],
  // openings and trim
  ["window", [62, 88, 116], 0.03],
  ["windowlit", [255, 222, 150], 0.02],
  ["glass", [118, 170, 204], 0.02],
  ["glassdark", [74, 116, 148], 0.02],
  ["mullion", [214, 222, 228], 0.01],
  ["white", [246, 246, 240], 0.01],
  ["trim", [64, 64, 70], 0.02],
  ["door", [120, 72, 50], 0.03],
  ["doorred", [196, 52, 42], 0.02],
  ["doorgreen", [58, 116, 84], 0.02],
  ["rolldoor", [226, 186, 62], 0.02, "corrugated"],
  ["steel", [164, 170, 176], 0.02],
  ["darksteel", [84, 90, 98], 0.02],
  ["rust", [184, 104, 62], 0.06],
  ["yellow", [238, 188, 44], 0.02],
  ["orange", [234, 124, 44], 0.02],
  ["red", [208, 58, 46], 0.02],
  ["blue", [62, 104, 176], 0.02],
  ["signgreen", [58, 152, 96], 0.02],
  ["pink", [236, 140, 168], 0.02],
  ["awningred", [212, 64, 56], 0.02],
  ["awninggreen", [64, 150, 104], 0.02],
  ["awningblue", [70, 124, 192], 0.02],
  ["tank", [206, 212, 216], 0.02],
  // ground
  ["grass", [138, 182, 88], 0.07],
  ["lawn", [150, 194, 96], 0.06],
  ["hedge", [74, 134, 64], 0.08],
  ["leaf", [96, 158, 70], 0.09],
  ["leafdark", [62, 122, 58], 0.09],
  ["leaflight", [150, 196, 90], 0.08],
  ["conifer", [52, 106, 70], 0.08],
  ["cherry", [242, 176, 196], 0.07],
  ["cherrydeep", [226, 138, 170], 0.07],
  ["trunk", [112, 82, 58], 0.05],
  ["maple", [212, 92, 50], 0.09],
  ["maplelight", [236, 148, 60], 0.08],
  ["snow", [240, 244, 248], 0.02],
  ["flowerred", [224, 72, 72], 0.05],
  ["floweryellow", [244, 214, 70], 0.05],
  ["sand", [228, 208, 152], 0.05],
  ["soil", [142, 102, 72], 0.07],
  ["rock", [152, 148, 142], 0.07],
  ["water", [70, 158, 196], 0.02],
  ["poolwater", [96, 196, 222], 0.02],
  // streets
  ["asphalt", [84, 86, 92], 0.04],
  ["asphaltpatch", [96, 98, 104], 0.03],
  ["lineyellow", [242, 204, 76], 0.01],
  ["linewhite", [238, 238, 230], 0.01],
  ["sidewalk", [206, 202, 190], 0.03, "pavers"],
  ["curb", [174, 172, 164], 0.02],
  ["paving", [190, 180, 164], 0.04, "pavers"],
  ["parking", [104, 106, 112], 0.03],
  ["lamppole", [62, 66, 74], 0.01],
  ["lamp", [255, 236, 176], 0.01],
  // vehicles
  ["carred", [214, 62, 52], 0.01],
  ["carblue", [66, 116, 196], 0.01],
  ["carwhite", [236, 236, 232], 0.01],
  ["caryellow", [240, 196, 52], 0.01],
  ["cargreen", [80, 160, 110], 0.01],
  ["tyre", [40, 40, 44], 0.01],
  // pot
  ["glaze", [58, 92, 142], 0.03],
  ["glazedeep", [42, 68, 112], 0.03],
  ["moss", [96, 146, 72], 0.08],
];

export const MATERIALS = [null];
export const MATERIAL_INDEX = new Map();
for (const [name, rgb, jitter, pattern] of MATERIAL_TABLE) {
  MATERIAL_INDEX.set(name, MATERIALS.length);
  MATERIALS.push({ name, rgb, jitter, pattern: pattern || null });
}

export function mat(name) {
  const index = MATERIAL_INDEX.get(name);
  if (!index) throw new Error(`unknown material ${name}`);
  return index;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The brightness multiplier a voxel gets from its material's pattern and
// jitter. Patterns key on world coordinates so neighbouring voxels agree.
export function voxelShade(material, x, y, z) {
  const m = MATERIALS[material];
  let shade = 1 + (hash3(x, y, z) - 0.5) * 2 * m.jitter;
  switch (m.pattern) {
    case "brick":
      if (z % 2 === 0) shade *= 0.94;
      else if ((x + y + (z >> 1)) % 3 === 0) shade *= 0.97;
      break;
    case "corrugated":
      if ((x + y) % 2 === 0) shade *= 0.9;
      break;
    case "planks":
      if (z % 2 === 0) shade *= 0.92;
      break;
    case "tiles":
      if (z % 2 === 0) shade *= 0.9;
      break;
    case "pavers":
      if (x % 4 === 0 || y % 4 === 0) shade *= 0.93;
      break;
    default:
      break;
  }
  return shade;
}

export class Model {
  constructor(w, d, h, name = "model") {
    this.w = w;
    this.d = d;
    this.h = h;
    this.name = name;
    this.data = new Uint8Array(w * d * h);
  }

  inside(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.d && z < this.h;
  }

  index(x, y, z) {
    return x + this.w * (y + this.d * z);
  }

  get(x, y, z) {
    return this.inside(x, y, z) ? this.data[this.index(x, y, z)] : 0;
  }

  set(x, y, z, m) {
    if (this.inside(x, y, z)) this.data[this.index(x, y, z)] = typeof m === "string" ? mat(m) : m;
  }

  // Half-open ranges: [x0, x1) × [y0, y1) × [z0, z1).
  box(x0, y0, z0, x1, y1, z1, m) {
    const id = typeof m === "string" ? mat(m) : m;
    for (let z = Math.max(0, z0); z < Math.min(this.h, z1); z += 1) {
      for (let y = Math.max(0, y0); y < Math.min(this.d, y1); y += 1) {
        for (let x = Math.max(0, x0); x < Math.min(this.w, x1); x += 1) this.data[this.index(x, y, z)] = id;
      }
    }
    return this;
  }

  clear(x0, y0, z0, x1, y1, z1) {
    return this.box(x0, y0, z0, x1, y1, z1, 0);
  }

  // Replace only voxels that already hold `from` (or any solid when from is null).
  paint(x0, y0, z0, x1, y1, z1, m, from = null) {
    const id = mat(m);
    const fromId = from == null ? null : mat(from);
    for (let z = Math.max(0, z0); z < Math.min(this.h, z1); z += 1) {
      for (let y = Math.max(0, y0); y < Math.min(this.d, y1); y += 1) {
        for (let x = Math.max(0, x0); x < Math.min(this.w, x1); x += 1) {
          const i = this.index(x, y, z);
          if (this.data[i] && (fromId == null || this.data[i] === fromId)) this.data[i] = id;
        }
      }
    }
    return this;
  }

  cylinder(cx, cy, r, z0, z1, m) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.box(x, y, z0, x + 1, y + 1, z1, m);
      }
    }
    return this;
  }

  // A lumpy ellipsoid; `rng` breaks the outline so canopies are not spheres.
  blob(cx, cy, cz, rx, ry, rz, m, rng, lump = 0.22, accent = null) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z += 1) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
          const dx = (x + 0.5 - cx) / rx;
          const dy = (y + 0.5 - cy) / ry;
          const dz = (z + 0.5 - cz) / rz;
          const d = dx * dx + dy * dy + dz * dz;
          const edge = 1 - lump * hash3(x * 7 + 3, y * 5 + 1, z * 3 + 11);
          if (d <= edge) {
            const useAccent = accent && dz > 0.1 && hash3(x, y, z * 13) < 0.35;
            this.set(x, y, z, useAccent ? accent : m);
          }
        }
      }
    }
    return this;
  }

  // Gable roof over [x0,x1)×[y0,y1) starting at z. `ridge` "x" runs the
  // ridge along x (slopes face ±y). The prism is filled with `wall` and every
  // voxel open to the sky becomes roof, so gable ends keep a roof edge.
  gable(x0, y0, x1, y1, z, ridge, roofMat, wallMat, overhang = 1) {
    const along = ridge === "x";
    const a0 = along ? y0 : x0;
    const a1 = along ? y1 : x1;
    const b0 = along ? x0 : y0;
    const b1 = along ? x1 : y1;
    const layers = Math.ceil((a1 - a0) / 2) + overhang;
    const cells = [];
    for (let k = 0; k < layers; k += 1) {
      const lo = a0 - overhang + k;
      const hi = a1 + overhang - k;
      if (hi <= lo) break;
      for (let a = lo; a < hi; a += 1) {
        for (let b = b0 - overhang; b < b1 + overhang; b += 1) {
          const insideWall = a >= a0 && a < a1 && b >= b0 && b < b1;
          const edgeRow = a === lo || a === hi - 1;
          if (!insideWall && !edgeRow) continue;
          const x = along ? b : a;
          const y = along ? a : b;
          cells.push([x, y, z + k, insideWall ? wallMat : roofMat]);
        }
      }
    }
    for (const [x, y, zz, m] of cells) this.set(x, y, zz, m);
    for (const [x, y, zz] of cells) if (this.get(x, y, zz) && !this.get(x, y, zz + 1)) this.set(x, y, zz, roofMat);
    // Voxels on the sloped faces: a voxel with open air on its downhill side.
    for (const [x, y, zz] of cells) {
      const open = along ? (!this.get(x, y - 1, zz) || !this.get(x, y + 1, zz)) : (!this.get(x - 1, y, zz) || !this.get(x + 1, y, zz));
      if (open && !this.get(x, y, zz + 1)) this.set(x, y, zz, roofMat);
    }
    return this;
  }

  hip(x0, y0, x1, y1, z, roofMat, overhang = 1) {
    let k = 0;
    while (true) {
      const lx = x0 - overhang + k;
      const hx = x1 + overhang - k;
      const ly = y0 - overhang + k;
      const hy = y1 + overhang - k;
      if (hx - lx < 1 || hy - ly < 1) break;
      this.box(lx, ly, z + k, hx, hy, z + k + 1, roofMat);
      k += 1;
      if (hx - lx <= 2 || hy - ly <= 2) break;
    }
    return this;
  }

  // Flat roof: a slab of `fill` inside a raised parapet of `rim`.
  flatRoof(x0, y0, x1, y1, z, rim = "trim", fill = "gravel", parapet = 1) {
    this.box(x0, y0, z, x1, y1, z + 1, fill);
    this.box(x0, y0, z + 1, x1, y0 + 1, z + 1 + parapet, rim);
    this.box(x0, y1 - 1, z + 1, x1, y1, z + 1 + parapet, rim);
    this.box(x0, y0, z + 1, x0 + 1, y1, z + 1 + parapet, rim);
    this.box(x1 - 1, y0, z + 1, x1, y1, z + 1 + parapet, rim);
    return this;
  }

  // Punched windows recessed one voxel into a solid block's four faces.
  // Rows repeat every `floor` voxels from z0; columns every `period`.
  windows(x0, y0, x1, y1, z0, z1, opts = {}) {
    const {
      floor = STOREY, height = 2, width = 2, period = 3, glass = "window", offset = 1,
      faces = ["n", "s", "e", "w"], recess = true, margin = 1,
    } = opts;
    const faceRuns = {
      s: { run: [x0 + margin, x1 - margin], fixed: y1 - 1, inward: -1, axis: "x" },
      n: { run: [x0 + margin, x1 - margin], fixed: y0, inward: 1, axis: "x" },
      e: { run: [y0 + margin, y1 - margin], fixed: x1 - 1, inward: -1, axis: "y" },
      w: { run: [y0 + margin, y1 - margin], fixed: x0, inward: 1, axis: "y" },
    };
    for (const face of faces) {
      const f = faceRuns[face];
      const span = f.run[1] - f.run[0];
      const count = Math.floor((span + (period - width)) / period);
      const used = count * period - (period - width);
      const start = f.run[0] + Math.floor((span - used) / 2);
      for (let z = z0; z < z1; z += 1) {
        if ((z - z0) % floor < offset || (z - z0) % floor >= offset + height) continue;
        for (let c = 0; c < count; c += 1) {
          for (let w = 0; w < width; w += 1) {
            const r = start + c * period + w;
            const x = f.axis === "x" ? r : f.fixed;
            const y = f.axis === "x" ? f.fixed : r;
            if (!this.get(x, y, z)) continue;
            if (recess) {
              this.set(x, y, z, 0);
              const ix = f.axis === "y" ? x + f.inward : x;
              const iy = f.axis === "x" ? y + f.inward : y;
              this.set(ix, iy, z, glass);
            } else {
              this.set(x, y, z, glass);
            }
          }
        }
      }
    }
    return this;
  }

  // Stamp another model at an offset (0 voxels are transparent).
  stamp(model, ox, oy, oz) {
    for (let z = 0; z < model.h; z += 1) {
      for (let y = 0; y < model.d; y += 1) {
        for (let x = 0; x < model.w; x += 1) {
          const m = model.data[model.index(x, y, z)];
          if (m) this.set(x + ox, y + oy, z + oz, m);
        }
      }
    }
    return this;
  }

  // Quarter turns counter-clockwise seen from above; the authored front (+y)
  // turns to +x, then -y, then -x.
  rotated(quarterTurns) {
    const q = ((quarterTurns % 4) + 4) % 4;
    if (q === 0) return this;
    const w = q % 2 ? this.d : this.w;
    const d = q % 2 ? this.w : this.d;
    const out = new Model(w, d, this.h, this.name);
    for (let z = 0; z < this.h; z += 1) {
      for (let y = 0; y < this.d; y += 1) {
        for (let x = 0; x < this.w; x += 1) {
          const m = this.data[this.index(x, y, z)];
          if (!m) continue;
          let nx = x;
          let ny = y;
          if (q === 1) { nx = y; ny = this.w - 1 - x; }
          if (q === 2) { nx = this.w - 1 - x; ny = this.d - 1 - y; }
          if (q === 3) { nx = this.d - 1 - y; ny = x; }
          out.data[out.index(nx, ny, z)] = m;
        }
      }
    }
    return out;
  }

  count() {
    let n = 0;
    for (const v of this.data) if (v) n += 1;
    return n;
  }
}
