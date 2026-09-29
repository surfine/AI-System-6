#!/usr/bin/env node
// Tiles the new terrain frames into a small map the way the Canvas renderer
// does (painter order, anchor at the tile centre, one altitude step = 10 px)
// so seams, slopes, skirts and shorelines can be judged together, with a few
// grove tiles on top. Output: internal/evidence/bonsai-miniature/ground-sc2k.png

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rasterize } from "./raster.mjs";
import { terrainTriangles } from "./terrain.mjs";
import { catalogFrames } from "./catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const N = 10;
// altitude map: a plateau in the back corner, a river across the front
const alt = (x, y) => (y >= 8 ? 0 : x <= 3 && y <= 3 ? 2 : x <= 5 && y <= 5 ? 1 : 0);
const water = (x, y) => y >= 8;
const coast = (x, y) => y === 7;
const grove = (x, y) => (x <= 2 && y <= 2 && (x + y) % 2 === 0) || (x === 7 && y === 2);
const frames = new Map(catalogFrames().map((f) => [f.id, f]));
// a street grid on the lowland, a rail line and a power line
const isRoad = (x, y) => (x === 6 && y <= 7) || (y === 6 && x >= 5) || (x === 9 && y <= 6);
const isRail = (x, y) => y === 4 && x >= 7 && x !== 9;
const isWire = (x, y) => x === 8 && y <= 3;
function network(x, y) {
  for (const [family, test] of [["road", isRoad], ["rail", isRail], ["wire", isWire]]) {
    if (!test(x, y)) continue;
    let mask = 0;
    if (test(x, y - 1)) mask |= 1;
    if (test(x + 1, y)) mask |= 2;
    if (test(x, y + 1)) mask |= 4;
    if (test(x - 1, y)) mask |= 8;
    return { family, mask };
  }
  return null;
}

const CELL = { width: 140, height: 140, anchorX: 70, anchorY: 90 };
const W = N * 64 + 140, H = N * 32 + 160;
const originX = W / 2, originY = 90;
const layers = [];
const order = [];
for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) order.push([x, y]);
order.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[1] - b[1]);
for (const [x, y] of order) {
  const here = alt(x, y);
  let mask = 0;
  if (y > 0 && alt(x, y - 1) > here) mask |= 1;
  if (x < N - 1 && alt(x + 1, y) > here) mask |= 2;
  if (y < N - 1 && alt(x, y + 1) > here) mask |= 4;
  if (x > 0 && alt(x - 1, y) > here) mask |= 8;
  const kind = water(x, y) ? "water" : coast(x, y) ? "coast" : "grass";
  const tris = terrainTriangles(kind, water(x, y) ? 0 : mask, 0, 0);
  const pixels = rasterize(null, { ...CELL, triangles: tris, footprint: { w: 16, d: 16 }, outline: false });
  const sx = originX + (x - y) * 32, sy = originY + (x + y) * 16 - here * 10;
  layers.push({ input: pixels, raw: { width: CELL.width, height: CELL.height, channels: 4 }, left: Math.round(sx - CELL.anchorX), top: Math.round(sy - CELL.anchorY) });
  const net = network(x, y);
  if (net) {
    const px = rasterize(frames.get(`${net.family}.mask-${net.mask}`).make(), { ...CELL, outline: net.family === "wire" });
    layers.push({ input: px, raw: { width: CELL.width, height: CELL.height, channels: 4 }, left: Math.round(sx - CELL.anchorX), top: Math.round(sy - CELL.anchorY) });
  }
  if (grove(x, y)) {
    const model = frames.get("tree.conifer").make();
    const px = rasterize(model, CELL);
    layers.push({ input: px, raw: { width: CELL.width, height: CELL.height, channels: 4 }, left: Math.round(sx - CELL.anchorX), top: Math.round(sy - CELL.anchorY) });
  }
}
const out = path.join(root, "internal/evidence/bonsai-miniature/ground-sc2k.png");
const flat = await sharp({ create: { width: W, height: H, channels: 4, background: "#181c24" } }).composite(layers).png().toBuffer();
await sharp(flat).resize(W * 2, H * 2, { kernel: "nearest" }).png().toFile(out);
console.log(path.relative(root, out));
