// Build the Bonsai City micro-voxel texture atlas from the checked-in
// atlas-source.json recipes: one deterministic 512x512 power-of-two PNG of
// 64px tiles (grass, soil, rock, sand, road, rail, wire, pipe, park, roof,
// tint-neutral walls with a glass mask in alpha, a roof deck, tree,
// construction, concrete, metal, and facility surfaces), plus a JSON manifest
// that maps block materials to per-face tile rects for the three.js voxel
// renderer.
//
// Wall tiles carry no hue: the renderer multiplies a per-building instance
// colour into them. Glass cells have alpha 0 (the shader reads alpha < 1 as
// glass and lights it with a uniform), so `.night` wall tiles are
// pixel-identical to their `.day` twins.
//
// No external art, network input, canvas package, or non-deterministic input
// participates. Minecraft-style chunky detail is painted from palette colors
// with deterministic hash noise, so a rebuild is byte-identical.

import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { desktopRoot } from "./lib/paths.mjs";

const assetsDir = path.join(desktopRoot, "assets", "bonsai");
const generatedDir = path.join(desktopRoot, "app", "generated");
const sourcePath = path.join(assetsDir, "atlas-source.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

const TILE = 64;
const GRID = 8;
const SIZE = GRID * TILE; // 512, power of two for mipmapped mobile/Retina use

function invariant(condition, message) {
  if (!condition) throw new Error(`bonsai-texture-invalid: ${message}`);
}

invariant(source.schema === "ai-system-6-bonsai-micro-voxel-source-v2", "source schema");
invariant(source.license === "MIT" && source.source === "original", "provenance boundary");
invariant(Array.isArray(source.textures) && source.textures.length > 0, "texture recipes");
invariant(source.textureMaterials && typeof source.textureMaterials === "object", "material face map");

function rgba(name) {
  const value = source.palette[name];
  invariant(Array.isArray(value) && value.length === 4, `palette ${name}`);
  return value;
}

function shade(color, amount) {
  return [
    Math.max(0, Math.min(255, color[0] + amount)),
    Math.max(0, Math.min(255, color[1] + amount)),
    Math.max(0, Math.min(255, color[2] + amount)),
    color[3],
  ];
}

// Deterministic hash noise: same (seed, x, y) always yields the same value.
function hashValue(seed, x, y) {
  let hash = 2166136261 ^ (seed & 0xffff);
  hash ^= x | 0;
  hash = Math.imul(hash, 16777619);
  hash ^= y | 0;
  hash = Math.imul(hash, 16777619);
  hash ^= (seed >>> 8) & 0xffff;
  hash = Math.imul(hash, 16777619);
  return (hash >>> 0) / 4294967296;
}

function seedFor(id) {
  let seed = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    seed ^= id.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

// The tile the active painter owns. Blob painters (canopy, maple, blossom)
// place rects at `bx - r`, which reaches up to 7 px outside the tile; without
// this clip those pixels landed in the neighbouring slot and put hue into
// the tint-neutral walls.
let paintClip = null;

function putPixel(buffer, x, y, color, alphaOverride = null) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  if (paintClip && (x < paintClip.x || y < paintClip.y || x >= paintClip.x + TILE || y >= paintClip.y + TILE)) return;
  const offset = (y * SIZE + x) * 4;
  buffer[offset] = color[0];
  buffer[offset + 1] = color[1];
  buffer[offset + 2] = color[2];
  buffer[offset + 3] = alphaOverride === null ? color[3] : alphaOverride;
}

function fillRect(buffer, x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) putPixel(buffer, x, y, color);
  }
}

// `hx`/`hy` is the origin the noise is hashed from. It defaults to the slot
// origin (the historical behaviour, kept so existing tiles do not change);
// a painter whose twins must be pixel-identical across slots passes 0, 0.
function speckle(buffer, ox, oy, seed, color, dark, light, density, hx = ox, hy = oy) {
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      const r = hashValue(seed, hx + x, hy + y);
      if (r < density) putPixel(buffer, ox + x, oy + y, dark);
      else if (r > 1 - density * 0.7) putPixel(buffer, ox + x, oy + y, light);
    }
  }
}

// Fixed inks for the `wall` painter. Every opaque ink is a near-grey
// (max channel - min channel <= 14) so an instance colour multiplied in by
// the renderer keeps its hue. Glass inks carry alpha 0: that alpha is the
// mask the shader reads, and their RGB is a luminance pattern only.
const WALL_INK = Object.freeze({
  base: [208, 204, 198, 255],
  speckleDark: [188, 184, 178, 255],
  speckleLight: [216, 212, 206, 255],
  mortar: [156, 152, 146, 255],
  frame: [96, 94, 90, 255],
  sill: [232, 230, 226, 255],
  glass: [224, 224, 224, 0],
  glassHighlight: [255, 255, 255, 0],
});

// The renderer crops a block's side face to the top k/rows of a wall tile,
// so each band must be one complete floor. With 3 rows a band is 21.33 px:
// the pixel rows that straddle a fractional band edge (21 and 42) belong to
// no band and stay plain wall. A band's safe rows are the integer rows that
// lie fully inside it; `end` is exclusive.
function wallBands(rows) {
  const bands = [];
  for (let band = 0; band < rows; band += 1) {
    bands.push({
      start: Math.ceil((band * TILE) / rows),
      end: Math.floor(((band + 1) * TILE) / rows),
    });
  }
  return bands;
}

const painters = {
  grass(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, dark, light, 0.22);
    for (let blade = 0; blade < 14; blade += 1) {
      const bx = ox + Math.floor(hashValue(seed, blade, 1) * 60);
      const by = oy + Math.floor(hashValue(seed, blade, 2) * 58);
      const color = hashValue(seed, blade, 3) > 0.5 ? dark : shade(dark, 12);
      fillRect(buffer, bx, by, 1, 3, color);
    }
  },
  soil(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, dark, light, 0.28);
    for (let pebble = 0; pebble < 8; pebble += 1) {
      const px = ox + Math.floor(hashValue(seed, pebble, 4) * 60);
      const py = oy + Math.floor(hashValue(seed, pebble, 5) * 60);
      fillRect(buffer, px, py, 2, 2, dark);
    }
  },
  rock(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, dark, light, 0.2);
    for (let crack = 0; crack < 5; crack += 1) {
      const start = Math.floor(hashValue(seed, crack, 6) * 60);
      const step = 8 + Math.floor(hashValue(seed, crack, 7) * 16);
      const horizontal = crack % 2 === 0;
      for (let t = 0; t < 10; t += 1) {
        const px = horizontal ? ox + start + t * 3 : ox + start + Math.floor(t / 3);
        const py = horizontal ? oy + Math.floor(t / 2) * step : oy + start + t * 3;
        putPixel(buffer, px, py, dark);
      }
    }
  },
  sand(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seedFor(recipe.id), base, dark, light, 0.12);
  },
  snow(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seedFor(recipe.id), base, dark, shade(base, -8), 0.16);
    // Soft wind drift: a few pale streaks, quiet like the rest of the snow.
    for (let streak = 0; streak < 6; streak += 1) {
      const sy = oy + streak * 10 + 4;
      fillRect(buffer, ox + 10 + (streak % 3) * 6, sy, 16, 1, dark);
    }
  },
  water(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const light = rgba(recipe.dark);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    for (const y of [14, 30, 46]) {
      for (let x = 6; x < TILE - 6; x += 4) {
        putPixel(buffer, ox + x, oy + y, light);
        putPixel(buffer, ox + x + 1, oy + y, light);
      }
    }
  },
  road(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, shade(base, -22), dark, 0.3);
    // Lane markings are drawn by the renderer as direction-aware strips so
    // they turn corners and continue across tile edges; the base stays a
    // seamless asphalt noise field. A few short cracks keep it readable.
    for (let crack = 0; crack < 6; crack += 1) {
      const cx = Math.floor(hashValue(seed, crack, 22) * 56);
      const cy = Math.floor(hashValue(seed, crack, 23) * 56);
      const horizontal = crack % 2 === 0;
      for (let t = 0; t < 6; t += 1) {
        putPixel(buffer, ox + cx + (horizontal ? t : 0), oy + cy + (horizontal ? 0 : t), light);
      }
    }
  },
  rail(buffer, ox, oy, recipe) {
    const ballast = rgba(recipe.base);
    const gravel = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, ballast);
    speckle(buffer, ox, oy, seed, ballast, gravel, shade(ballast, 18), 0.3);
    // Sleepers repeat on a period that divides the tile edge (16 px), so the
    // ballast reads continuous across tiles. The rails themselves are
    // direction-aware strips in the renderer.
    for (let sleeper = 0; sleeper < TILE; sleeper += 16) {
      fillRect(buffer, ox + 10, oy + sleeper, TILE - 20, 3, shade(ballast, -20));
    }
  },
  wire(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seedFor(recipe.id), base, dark, light, 0.24);
  },
  pipe(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    for (let y = 0; y < TILE; y += 8) {
      fillRect(buffer, ox, oy + y, TILE, 1, dark);
      fillRect(buffer, ox, oy + y + 4, TILE, 1, shade(base, 16));
    }
    speckle(buffer, ox, oy, seedFor(recipe.id), base, dark, light, 0.08);
  },
  park(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, dark, shade(base, 12), 0.25);
    const flowers = [rgba("red"), rgba("yellow"), rgba("white")];
    for (let flower = 0; flower < 6; flower += 1) {
      const fx = ox + 4 + Math.floor(hashValue(seed, flower, 8) * 56);
      const fy = oy + 4 + Math.floor(hashValue(seed, flower, 9) * 56);
      const color = flowers[Math.floor(hashValue(seed, flower, 10) * flowers.length)];
      fillRect(buffer, fx, fy, 2, 2, color);
    }
    // Zen garden corner: a mossy rock on a faint raked-sand circle — one
    // quiet detail, not decoration.
    const sand = rgba("sand");
    for (let ring = 0; ring < 3; ring += 1) {
      const r = 5 + ring * 4;
      for (let t = 0; t < 10; t += 1) {
        const px = ox + 48 + Math.round(Math.cos((t / 10) * Math.PI * 2) * r);
        const py = oy + 46 + Math.round(Math.sin((t / 10) * Math.PI * 2) * r * 0.5);
        putPixel(buffer, px, py, sand);
      }
    }
    fillRect(buffer, ox + 44, oy + 40, 6, 5, rgba("rock"));
    fillRect(buffer, ox + 42, oy + 38, 5, 3, rgba("grassDark"));
  },
  wall(buffer, ox, oy, recipe) {
    // The recipe's hue keys (base, dark, light, window) are not read: the
    // wall is painted from the fixed neutral WALL_INK so the renderer's
    // instance colour multiplies in without going muddy. A `.night` twin
    // shares its `.day` seed, so the two tiles are pixel-identical.
    const ink = WALL_INK;
    const seed = seedFor(recipe.id.replace(/\.night$/, ".day"));
    fillRect(buffer, ox, oy, TILE, TILE, ink.base);
    speckle(buffer, ox, oy, seed, ink.base, ink.speckleDark, ink.speckleLight, 0.2, 0, 0);
    const cols = Number(recipe.cols) || 4;
    const rows = Number(recipe.rows) || 3;
    const bands = wallBands(rows);
    if (recipe.brick) {
      // Brick courses are 16 px tall, so a course must never straddle a
      // band edge: fail the build instead of painting a crossing course.
      invariant((TILE / rows) % 16 === 0, `${recipe.id}: 16px brick courses must fit the ${rows}-row bands`);
      for (let y = 0; y < TILE; y += 16) {
        const offset = Math.floor(y / 16) % 2 === 0 ? 0 : 8;
        fillRect(buffer, ox, oy + y, TILE, 1, ink.mortar);
        for (let x = offset; x < TILE; x += 16) {
          fillRect(buffer, ox + x, oy + y, 1, 16, ink.mortar);
        }
      }
    } else {
      // One floor slab line at the top row of every band.
      for (const band of bands) fillRect(buffer, ox, oy + band.start, TILE, 1, ink.mortar);
    }
    const cellW = TILE / cols;
    const large = Boolean(recipe.largeWindows);
    const winW = large ? 12 : 8;
    const winH = large ? 10 : 9;
    // One pane element is: 1 px frame, glass, 1 px frame, 1 px sill. It is
    // centred in the band's safe rows with at least one wall row above and
    // below, so no glass pixel touches a band edge.
    const elementH = winH + 3;
    for (const band of bands) {
      const safeRows = band.end - band.start;
      invariant(safeRows >= elementH + 2, `${recipe.id}: a ${rows}-row band cannot hold a ${elementH}px pane`);
      const wy = oy + band.start + Math.floor((safeRows - elementH) / 2) + 1;
      for (let col = 0; col < cols; col += 1) {
        const wx = ox + Math.floor(col * cellW + (cellW - winW) / 2);
        fillRect(buffer, wx - 1, wy - 1, winW + 2, winH + 2, ink.frame);
        fillRect(buffer, wx, wy, winW, winH, ink.glass);
        fillRect(buffer, wx, wy, winW, 2, ink.glassHighlight);
        fillRect(buffer, wx - 1, wy + winH + 1, winW + 2, 1, ink.sill);
      }
    }
  },
  deck(buffer, ox, oy) {
    // Roof deck: neutral grey with a faint 2x2 ordered dither (one cell in
    // four) and 1 px tar seams every 16 px on both axes. The greys are fixed,
    // not recipe keys, so the deck stays as tint-neutral as the walls.
    const base = [210, 208, 204, 255];
    const dither = [196, 194, 190, 255];
    const seam = [180, 178, 174, 255];
    fillRect(buffer, ox, oy, TILE, TILE, base);
    for (let y = 0; y < TILE; y += 2) {
      for (let x = 0; x < TILE; x += 2) putPixel(buffer, ox + x, oy + y, dither);
    }
    for (const line of [0, 16, 32, 48]) {
      fillRect(buffer, ox + line, oy, 1, TILE, seam);
      fillRect(buffer, ox, oy + line, TILE, 1, seam);
    }
  },
  roof(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    for (let row = 0; row < TILE / 8; row += 1) {
      const y = row * 8;
      fillRect(buffer, ox, oy + y + 6, TILE, 2, dark);
      for (let tile = 0; tile < 8; tile += 1) {
        const tx = ox + tile * 8;
        if (hashValue(seed, row * 8 + tile, 12) > 0.55) {
          fillRect(buffer, tx, oy + y, 4, 2, dark);
        }
      }
    }
    speckle(buffer, ox, oy, seed, base, dark, light, 0.06);
  },
  trunk(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    for (let streak = 0; streak < 8; streak += 1) {
      const sx = ox + Math.floor(hashValue(seed, streak, 13) * 60);
      for (let y = 0; y < TILE; y += 2) {
        putPixel(buffer, sx, oy + y, streak % 2 ? dark : shade(base, 14));
      }
    }
  },
  canopy(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    for (let blob = 0; blob < 22; blob += 1) {
      const bx = ox + Math.floor(hashValue(seed, blob, 14) * 56);
      const by = oy + Math.floor(hashValue(seed, blob, 15) * 56);
      const r = 3 + Math.floor(hashValue(seed, blob, 16) * 5);
      const color = hashValue(seed, blob, 17) > 0.5 ? dark : light;
      fillRect(buffer, bx - r, by - r, r * 2, r * 2, color);
    }
    speckle(buffer, ox, oy, seed, base, dark, light, 0.1);
  },
  maple(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    for (let blob = 0; blob < 18; blob += 1) {
      const bx = ox + Math.floor(hashValue(seed, blob, 30) * 56);
      const by = oy + Math.floor(hashValue(seed, blob, 31) * 56);
      const r = 3 + Math.floor(hashValue(seed, blob, 32) * 4);
      const color = hashValue(seed, blob, 33) > 0.55 ? dark : light;
      fillRect(buffer, bx - r, by - r, r * 2, r * 2, color);
    }
    speckle(buffer, ox, oy, seed, base, dark, light, 0.08);
  },
  blossom(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    for (let bloom = 0; bloom < 16; bloom += 1) {
      const bx = ox + Math.floor(hashValue(seed, bloom, 40) * 56);
      const by = oy + Math.floor(hashValue(seed, bloom, 41) * 56);
      const r = 4 + Math.floor(hashValue(seed, bloom, 42) * 5);
      const color = hashValue(seed, bloom, 43) > 0.6 ? dark : light;
      fillRect(buffer, bx - r, by - r, r * 2, r * 2, color);
    }
    speckle(buffer, ox, oy, seed, base, dark, light, 0.08);
  },
  winterCanopy(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, dark, light, 0.22);
    // Snow-dusted twigs: a few darker bare branches.
    for (let twig = 0; twig < 6; twig += 1) {
      const tx = ox + 6 + Math.floor(hashValue(seed, twig, 44) * 50);
      const ty = oy + 6 + Math.floor(hashValue(seed, twig, 45) * 50);
      for (let t = 0; t < 6; t += 1) {
        putPixel(buffer, tx + t, ty + (t < 3 ? 0 : 1), dark);
      }
    }
  },
  stripes(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    for (let y = 0; y < TILE; y += 1) {
      for (let x = 0; x < TILE; x += 1) {
        const band = Math.floor((x + y) / 8) % 2;
        if (band) putPixel(buffer, ox + x, oy + y, y > 32 ? dark : light);
      }
    }
  },
  abandoned(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, dark, light, 0.34);
    for (let rubble = 0; rubble < 12; rubble += 1) {
      const rx = ox + Math.floor(hashValue(seed, rubble, 18) * 58);
      const ry = oy + Math.floor(hashValue(seed, rubble, 19) * 58);
      fillRect(buffer, rx, ry, 3, 2, dark);
    }
  },
  concrete(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seedFor(recipe.id), base, shade(base, -16), light, 0.16);
    for (const line of [0, 16, 32, 48]) {
      fillRect(buffer, ox + line, oy, 1, TILE, dark);
      fillRect(buffer, ox, oy + line, TILE, 1, dark);
    }
  },
  metal(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    for (let y = 0; y < TILE; y += 4) {
      fillRect(buffer, ox, oy + y, TILE, 1, y % 8 === 0 ? light : shade(base, -12));
    }
    for (const [x, y] of [[8, 8], [55, 8], [8, 55], [55, 55]]) {
      fillRect(buffer, ox + x - 1, oy + y - 1, 2, 2, dark);
    }
  },
  military(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, shade(base, -18), dark, 0.2);
    // Perimeter fence posts read as a bounded installation.
    for (const x of [6, 30, 54]) {
      for (const y of [6, 30, 54]) {
        fillRect(buffer, ox + x - 1, oy + y - 1, 3, 3, light);
      }
    }
  },
  runway(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, shade(base, -20), dark, 0.26);
    // Edge lines and a dashed centre line, continuous across tiles.
    fillRect(buffer, ox + 4, oy, 1, TILE, light);
    fillRect(buffer, ox + TILE - 5, oy, 1, TILE, light);
    for (let y = 0; y < TILE; y += 16) {
      fillRect(buffer, ox + 30, oy + y + 4, 4, 6, light);
    }
  },
  dock(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, shade(base, -16), dark, 0.18);
    fillRect(buffer, ox, oy + TILE - 8, TILE, 3, dark);
    for (const x of [10, 30, 50]) {
      fillRect(buffer, ox + x, oy + TILE - 14, 3, 5, light);
    }
  },
  police(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, shade(base, -20), dark, 0.16);
    fillRect(buffer, ox + 24, oy + 14, 16, 20, dark);
    fillRect(buffer, ox + 28, oy + 18, 8, 12, base);
    fillRect(buffer, ox + 30, oy + 20, 4, 4, rgba("yellow"));
  },
  fire(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, shade(base, -24), dark, 0.14);
    fillRect(buffer, ox, oy + 26, TILE, 8, dark);
    fillRect(buffer, ox + 6, oy + 30, 6, 6, rgba(recipe.light));
  },
  clinic(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, shade(base, -14), dark, 0.1);
    const red = rgba(recipe.light);
    fillRect(buffer, ox + 22, oy + 20, 20, 6, red);
    fillRect(buffer, ox + 29, oy + 13, 6, 20, red);
  },
  coal(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, dark, shade(base, 14), 0.3);
    for (let vent = 0; vent < 6; vent += 1) {
      const vx = ox + 8 + Math.floor(hashValue(seed, vent, 20) * 44);
      const vy = oy + 8 + Math.floor(hashValue(seed, vent, 21) * 44);
      fillRect(buffer, vx, vy, 3, 3, rgba(recipe.light));
    }
  },
  wind(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, shade(base, -10), dark, 0.1);
    fillRect(buffer, ox + 30, oy + 4, 4, 56, dark);
    fillRect(buffer, ox + 10, oy + 28, 44, 3, dark);
  },
  nuclear(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seedFor(recipe.id), base, shade(base, -10), dark, 0.1);
    for (let y = 32; y < TILE; y += 1) {
      for (let x = 0; x < TILE; x += 1) {
        const band = Math.floor((x + y) / 8) % 2;
        if (band) putPixel(buffer, ox + x, oy + y, light);
      }
    }
  },
  solar(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    for (let gy = 0; gy < 4; gy += 1) {
      for (let gx = 0; gx < 4; gx += 1) {
        const cx = ox + gx * 16;
        const cy = oy + gy * 16;
        fillRect(buffer, cx, cy, 16, 16, (gx + gy) % 2 ? base : shade(base, 16));
        fillRect(buffer, cx + 7, cy + 7, 2, 2, dark);
      }
    }
    for (const line of [0, 16, 32, 48]) {
      fillRect(buffer, ox + line, oy, 1, TILE, light);
      fillRect(buffer, ox, oy + line, TILE, 1, light);
    }
  },
  tower(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seedFor(recipe.id), base, shade(base, -18), dark, 0.16);
    for (let y = 0; y < TILE; y += 12) {
      fillRect(buffer, ox, oy + y, TILE, 1, dark);
      fillRect(buffer, ox + 12, oy + y, 1, 12, dark);
      fillRect(buffer, ox + 50, oy + y, 1, 12, dark);
    }
    fillRect(buffer, ox + 12, oy, 40, 1, light);
  },
  pump(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seedFor(recipe.id), base, shade(base, -16), dark, 0.14);
    fillRect(buffer, ox + 20, oy + 6, 24, 12, light);
    fillRect(buffer, ox + 30, oy + 2, 4, 8, dark);
    for (let y = 24; y < TILE; y += 8) {
      fillRect(buffer, ox, oy + y, TILE, 1, dark);
    }
  },
  station(buffer, ox, oy, recipe) {
    const base = rgba(recipe.base);
    const dark = rgba(recipe.dark);
    const light = rgba(recipe.light);
    const seed = seedFor(recipe.id);
    fillRect(buffer, ox, oy, TILE, TILE, base);
    speckle(buffer, ox, oy, seed, base, shade(base, -20), dark, 0.22);
    fillRect(buffer, ox + 6, oy + 30, TILE - 12, 2, dark);
    fillRect(buffer, ox + 6, oy + 38, TILE - 12, 2, dark);
    fillRect(buffer, ox, oy + 52, TILE, 3, light);
  },
};

const tiles = source.textures;
invariant(tiles.length <= GRID * GRID, "tile count fits the power-of-two grid");

const pixels = Buffer.alloc(SIZE * SIZE * 4);
const rects = {};
tiles.forEach((tile, index) => {
  const painter = painters[tile.pattern];
  invariant(typeof painter === "function", `texture pattern ${tile.pattern}`);
  const ox = (index % GRID) * TILE;
  const oy = Math.floor(index / GRID) * TILE;
  paintClip = { x: ox, y: oy };
  painter(pixels, ox, oy, tile);
  paintClip = null;
  rects[tile.id] = { x: ox, y: oy, w: TILE, h: TILE };
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    let current = (crc ^ buffer[index]) & 0xff;
    for (let bit = 0; bit < 8; bit += 1) current = current & 1 ? (current >>> 1) ^ 0xedb88320 : current >>> 1;
    crc = (crc >>> 8) ^ current;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    pixels.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

await mkdir(assetsDir, { recursive: true });
await mkdir(generatedDir, { recursive: true });

const png = encodePng(SIZE, SIZE);
const pngFile = "assets/bonsai/textures.png";
await writeFile(path.join(assetsDir, "textures.png"), png);

const manifest = {
  schema: "ai-system-6-bonsai-textures-v1",
  version: 1,
  tileSize: TILE,
  atlas: { width: SIZE, height: SIZE, columns: GRID, rows: GRID },
  png: { url: "/assets/bonsai/textures.png", file: pngFile, sha256: digest(png) },
  tiles: rects,
  materials: source.textureMaterials,
  license: "MIT",
  source: "original",
  authoredAt: source.authoredAt,
  author: source.author,
  notes: [
    "Original micro-voxel texture art painted from project-owned recipes with deterministic hash noise; no pixels copied, traced, sampled, or converted from any external game or artwork.",
    "The generator has no network path and reads only the checked-in source recipe.",
    "The atlas is a 512x512 power of two of 64px tiles so the three.js renderer can mipmap it for Retina and mobile GPUs.",
    "Wall tiles are tint-neutral greys the renderer multiplies an instance colour into; alpha 0 marks glass, which a shader uniform lights, so .night wall tiles equal their .day twins.",
  ],
};
await writeFile(path.join(assetsDir, "textures.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const generated = `// Generated by tooling/build-bonsai-texture-atlas.mjs. Do not edit by hand.\n` +
  `// Original MIT-clean micro-voxel texture manifest; source lives in atlas-source.json.\n` +
  `(function installBonsaiTextures(){\"use strict\";const data=${JSON.stringify(manifest)};` +
  `Object.freeze(data.atlas);Object.freeze(data.png);Object.freeze(data.tiles);Object.freeze(data.materials);` +
  `window.AISystem6BonsaiTextures=Object.freeze(data);})();\n`;
await writeFile(path.join(generatedDir, "bonsai-textures.js"), generated);

console.log(`Bonsai textures: ${tiles.length} tiles, ${SIZE}x${SIZE}, ${png.length} bytes`);
