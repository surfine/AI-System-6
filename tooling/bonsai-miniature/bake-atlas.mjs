#!/usr/bin/env node
// Overlay the voxel catalog onto the Canvas 2D atlas. Every frame the catalog
// draws (catalog.mjs) is rendered in all four camera directions by the
// deterministic rasterizer and replaces the old frame; every other frame is
// copied unchanged, so the game keeps working while families migrate one by
// one. Frame ids, the union-trimmed rectangle per frame, the footprint-centre
// anchor and the shelf packing follow tooling/build-bonsai-atlas.mjs, so the
// renderer needs no change. Running it twice gives the same bytes.
//   node tooling/bonsai-miniature/bake-atlas.mjs

import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { MATERIALS } from "./voxel.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogFrames } from "./catalog.mjs";
import { rasterize } from "./raster.mjs";
import { bakeToolIcons } from "./bake-icons.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const assets = path.join(root, "apps/desktop/assets/bonsai");
const generatedDir = path.join(root, "apps/desktop/app/generated");
const DIRECTIONS = ["north", "east", "south", "west"];
const CELL_W = 320;
const CELL_H = 600;
const ANCHOR_X = 160;
const ANCHOR_Y = CELL_H - 84;
const ATLAS_W = 2048;

const modelsOnly = process.argv.includes("--models-only");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const invariant = (ok, message) => { if (!ok) throw new Error(message); };

const metadata = JSON.parse(await readFile(path.join(assets, "atlas-metadata.json"), "utf8"));
const oldAtlas = await Promise.all(DIRECTIONS.map(async (direction) => {
  const { data, info } = await sharp(path.join(assets, `atlas-${direction}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}));

const catalog = new Map(catalogFrames().map((frame) => [frame.id, frame]));
const modelCache = new Map();
const modelFor = (frame) => {
  if (!modelCache.has(frame.make)) modelCache.set(frame.make, frame.make());
  return modelCache.get(frame.make);
};

const started = Date.now();
const packed = [];
let voxelFrames = 0;
// Frames the old atlas never carried are appended after the ones it did, with
// metadata built from their model.
const frameList = Object.entries(metadata.frames);
for (const entry of catalog.values()) {
  if (!entry.extra || metadata.frames[entry.id]) continue;
  const model = modelFor(entry);
  frameList.push([entry.id, {
    x: 0, y: 0, w: 1, h: 1, footprint: { w: model.w / 16, h: model.d / 16 }, anchor: { x: 0, y: 0 }, height: 0,
    state: "normal", animation: null, variant: entry.extra.variant || 1, category: entry.extra.category || "scenery",
    zone: null, stage: 0, density: null, license: "MIT", source: "original",
  }]);
}
if (!modelsOnly) for (const [id, old] of frameList) {
  const entry = catalog.get(id);
  const model = entry ? modelFor(entry) : null;
  if (model) {
    const w = model.surface ? model.footprint.w : model.w;
    const dVox = model.surface ? model.footprint.d : model.d;
    invariant(w === old.footprint.w * 16 && dVox === old.footprint.h * 16, `${id}: model is ${w}x${dVox} voxels but the frame footprint is ${old.footprint.w}x${old.footprint.h} tiles`);
    const view = { width: CELL_W, height: CELL_H, anchorX: ANCHOR_X, anchorY: ANCHOR_Y, night: entry.night };
    const cells = DIRECTIONS.map((_, d) => {
      const q = (4 - d) % 4;
      return model.surface
        ? rasterize(model.overlay ? model.overlay.rotated(q) : null, { ...view, triangles: model.surface(q), footprint: model.footprint, outline: model.outline !== false })
        : rasterize(model.rotated(q), { ...view, outline: entry.outline !== false });
    });
    let left = CELL_W, top = CELL_H, right = -1, bottom = -1;
    for (const pixels of cells) for (let y = 0; y < CELL_H; y += 1) for (let x = 0; x < CELL_W; x += 1) {
      if (!pixels[(y * CELL_W + x) * 4 + 3]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
    invariant(right >= left, `empty voxel frame ${id}`);
    invariant(left > 0 && top > 0 && right < CELL_W - 1 && bottom < CELL_H - 1, `clipped voxel frame ${id}`);
    left -= 1; top -= 1; right += 1; bottom += 1;
    const fw = right - left + 1, h = bottom - top + 1;
    const pixels = cells.map((cell) => {
      const out = Buffer.alloc(fw * h * 4);
      for (let y = 0; y < h; y += 1) cell.copy(out, y * fw * 4, ((top + y) * CELL_W + left) * 4, ((top + y) * CELL_W + left + fw) * 4);
      return out;
    });
    const anchor = { x: ANCHOR_X - left, y: ANCHOR_Y - top };
    const footprintHalf = (old.footprint.w + old.footprint.h) * 8;
    packed.push({ id, w: fw, h, anchor, pixels, meta: { ...old, height: Math.max(0, anchor.y - footprintHalf), source: "original" } });
    voxelFrames += 1;
  } else {
    const pixels = oldAtlas.map(({ data, width }) => {
      const out = Buffer.alloc(old.w * old.h * 4);
      for (let y = 0; y < old.h; y += 1) data.copy(out, y * old.w * 4, ((old.y + y) * width + old.x) * 4, ((old.y + y) * width + old.x + old.w) * 4);
      return out;
    });
    packed.push({ id, w: old.w, h: old.h, anchor: { ...old.anchor }, pixels, meta: old });
  }
}

if (!modelsOnly) {
let shelfX = 0, shelfY = 0, shelfH = 0;
for (const rect of packed) {
  if (shelfX + rect.w > ATLAS_W) { shelfY += shelfH; shelfX = 0; shelfH = 0; }
  rect.x = shelfX;
  rect.y = shelfY;
  shelfX += rect.w;
  shelfH = Math.max(shelfH, rect.h);
}
const atlasH = shelfY + shelfH;

const files = {};
for (let d = 0; d < DIRECTIONS.length; d += 1) {
  const buffer = Buffer.alloc(ATLAS_W * atlasH * 4);
  for (const rect of packed) for (let y = 0; y < rect.h; y += 1) rect.pixels[d].copy(buffer, ((rect.y + y) * ATLAS_W + rect.x) * 4, y * rect.w * 4, (y + 1) * rect.w * 4);
  const png = await sharp(buffer, { raw: { width: ATLAS_W, height: atlasH, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  const filename = `atlas-${DIRECTIONS[d]}.png`;
  await writeFile(path.join(assets, filename), png);
  if (d === 0) await writeFile(path.join(assets, "atlas.png"), png);
  files[DIRECTIONS[d]] = { url: `/assets/bonsai/${filename}`, file: `assets/bonsai/${filename}`, sha256: digest(png) };
}

const frames = {};
for (const rect of packed) {
  frames[rect.id] = { ...rect.meta, x: rect.x, y: rect.y, w: rect.w, h: rect.h, anchor: rect.anchor };
}
// Tool palette icons from the same models (bake-icons.mjs).
const iconSheet = await bakeToolIcons((frameId) => {
  const entry = catalog.get(frameId);
  return entry ? modelFor(entry) : null;
});
await writeFile(path.join(assets, "tool-icons.png"), iconSheet.png);
const toolIcons = {
  url: "/assets/bonsai/tool-icons.png", file: "assets/bonsai/tool-icons.png", sha256: digest(iconSheet.png),
  cell: iconSheet.cell, columns: iconSheet.columns, rows: iconSheet.rows, icons: iconSheet.icons,
};

const out = {
  ...metadata,
  toolIcons,
  atlas: { ...metadata.atlas, width: ATLAS_W, height: atlasH, cellHeight: Math.max(metadata.atlas.cellHeight, CELL_H) },
  directions: files,
  frames,
  completeness: { ...metadata.completeness, frameCount: packed.length, voxelFrames },
};
await writeFile(path.join(assets, "atlas-metadata.json"), `${JSON.stringify(out, null, 2)}\n`);

const generated = `// Generated by tooling/build-bonsai-atlas.mjs and tooling/bonsai-miniature/bake-atlas.mjs. Do not edit by hand.\n` +
  `// Original MIT-clean art; source and provenance live under assets/bonsai/.\n` +
  `(function installBonsaiAtlas(){"use strict";const data=${JSON.stringify(out)};` +
  `Object.freeze(data.geometry);Object.freeze(data.atlas);Object.values(data.directions).forEach(Object.freeze);` +
  `Object.freeze(data.directions);Object.values(data.frames).forEach((frame)=>{Object.freeze(frame.footprint);Object.freeze(frame.anchor);Object.freeze(frame);});` +
  `Object.freeze(data.frames);Object.freeze(data.completeness.buildingStates);Object.freeze(data.completeness.categories);Object.freeze(data.completeness);` +
  `window.AISystem6BonsaiAtlas=Object.freeze(data);})();\n`;
await writeFile(path.join(generatedDir, "bonsai-atlas.js"), generated);

const provenancePath = path.join(assets, "provenance.json");
const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
provenance.files = Object.values(files).map(({ file, sha256 }) => ({ file, sha256 }));
provenance.tool = "tooling/build-bonsai-atlas.mjs, then tooling/bonsai-miniature/bake-atlas.mjs (authored voxel models, deterministic CPU isometric rasterizer)";
const note = `${voxelFrames} frames (growable buildings and their build states) are original voxel models authored in tooling/bonsai-miniature and rasterized on the CPU with exact 2:1 isometric arithmetic; no external art was consulted, traced or sampled.`;
provenance.notes = [...(provenance.notes || []).filter((line) => !line.includes("tooling/bonsai-miniature")), note];
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`bake-atlas: ${voxelFrames} voxel frames, ${packed.length - voxelFrames} kept, atlas ${ATLAS_W}x${atlasH}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

// The live 3D view draws the very same models: every voxel frame (day frames
// only; night reuses them) is exported as run-length data so the 3D backend
// can mesh it. Identical models are stored once.
{
  const index = { version: 1, tile: 16, storey: 3, palette: [], frames: {}, models: [] };
  // The ground colours of the 2D terrain frames (terrain.mjs), so the 3D
  // view's grass, soil, sand and water match the atlas.
  index.ground = { grass: [132, 180, 84], soil: [138, 172, 82], rock: [136, 170, 86], sand: [226, 206, 150], water: [66, 150, 192], waterLight: [150, 206, 228], side: [152, 110, 76] };
  for (let i = 1; i < MATERIALS.length; i += 1) index.palette.push([...MATERIALS[i].rgb, MATERIALS[i].name]);
  const chunks = [];
  const byKey = new Map();
  let offset = 0;
  for (const [id] of frameList) {
    const entry = catalog.get(id);
    if (!entry || entry.night) continue;
    const model = modelFor(entry);
    if (!model || model.surface) continue;
    const key = `${model.w}x${model.d}x${model.h}:${digest(model.data)}`;
    if (!byKey.has(key)) {
      const runs = [];
      const d = model.data;
      for (let i = 0; i < d.length;) {
        let j = i;
        while (j < d.length && d[j] === d[i] && j - i < 255) j += 1;
        runs.push(d[i], j - i);
        i = j;
      }
      const bytes = Buffer.from(runs);
      byKey.set(key, index.models.length);
      index.models.push({ w: model.w, d: model.d, h: model.h, o: offset, l: bytes.length });
      chunks.push(bytes);
      offset += bytes.length;
    }
    index.frames[id] = byKey.get(key);
  }
  index.blob = gzipSync(Buffer.concat(chunks), { level: 9 }).toString("base64");
  await writeFile(path.join(assets, "voxel-models.json"), `${JSON.stringify(index)}\n`);
  console.log(`bake-atlas: ${index.models.length} voxel models for the 3D view, ${Object.keys(index.frames).length} frames, ${(index.blob.length / 1024).toFixed(0)} KB`);
}
