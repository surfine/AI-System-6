#!/usr/bin/env node
// Contact sheet of every authored model through the deterministic SC2K
// rasterizer (the same pixels the game atlas gets). Growable designs show
// variant 0 at rank 0 and variant 5 at rank 7, so colourways and tower
// heights can be judged at a glance.
//   node tooling/bonsai-miniature/sheet.mjs [--night] [--only <id-substring>]
// Output: internal/evidence/bonsai-miniature/catalog-sc2k[-night].png

import sharp from "sharp";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { rasterize } from "./raster.mjs";
import { BUILDINGS } from "./buildings.mjs";
import { GROWABLES } from "./buildings-growables.mjs";
import { FACILITIES } from "./civic.mjs";
import { SPECIALS } from "./specials.mjs";
import { catalogFrames } from "./catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const night = args.includes("--night");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

const CELL_W = args.includes("--frames") ? 110 : 280;
const CELL_H = args.includes("--frames") ? 150 : 460;
const LABEL_H = 34;
const cols = args.includes("--frames") ? 16 : 8;

const entries = [];
for (const def of BUILDINGS) entries.push({ id: def.id, label: def.label, tag: `${def.zone} · ${def.size}×${def.size} · sample`, model: def.make(0) });
for (const def of GROWABLES) {
  entries.push({ id: def.id, label: def.label, tag: `${def.zone}.${def.size}.${def.tier} · v0 r0`, model: def.make(0, 0) });
  entries.push({ id: def.id, label: def.label, tag: `${def.zone}.${def.size}.${def.tier} · v5 r7`, model: def.make(5, 7) });
}
for (const [id, def] of [...Object.entries(FACILITIES), ...Object.entries(SPECIALS)]) {
  entries.push({ id, label: def.label, tag: `${id} · ${def.size}×${def.size}`, model: def.make(0) });
}
// --frames a,b: catalog frames whose id starts with one of the prefixes
const framesArg = args.includes("--frames") ? args[args.indexOf("--frames") + 1].split(",") : null;
if (framesArg) {
  entries.length = 0;
  for (const f of catalogFrames()) {
    if (f.night || !framesArg.some((prefix) => f.id.startsWith(prefix))) continue;
    const model = f.make();
    if (!model || model.surface) continue;
    entries.push({ id: f.id, label: `${f.id} / ${f.id}`, tag: f.id, model });
  }
}
const shown = entries.filter((e) => !only || e.id.includes(only));
const rows = Math.ceil(shown.length / cols);
const layers = [];
shown.forEach((entry, i) => {
  const pixels = rasterize(entry.model, { width: CELL_W, height: CELL_H, anchorX: CELL_W / 2, anchorY: CELL_H - (framesArg ? 40 : 80), night });
  const left = (i % cols) * CELL_W;
  const top = Math.floor(i / cols) * (CELL_H + LABEL_H);
  layers.push({ input: pixels, raw: { width: CELL_W, height: CELL_H, channels: 4 }, left, top });
  const [en, zh] = entry.label.split(" / ");
  layers.push({
    input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${LABEL_H}">`
      + `<text x="${CELL_W / 2}" y="14" text-anchor="middle" font-family="PingFang SC, Helvetica" font-size="12" fill="#f4f1ea">${zh || en}</text>`
      + `<text x="${CELL_W / 2}" y="28" text-anchor="middle" font-family="Helvetica" font-size="10" fill="#a9a59c">${entry.tag}</text></svg>`),
    left,
    top: top + CELL_H,
  });
});
const W = cols * CELL_W;
const H = rows * (CELL_H + LABEL_H);
const out = path.join(root, "internal/evidence/bonsai-miniature", `catalog-sc2k${night ? "-night" : ""}${only ? `-${only}` : ""}${framesArg ? "-frames" : ""}.png`);
await mkdir(path.dirname(out), { recursive: true });
await sharp({ create: { width: W, height: H, channels: 4, background: night ? "#0c0f16" : "#181c24" } }).composite(layers).png().toFile(out);
console.log(path.relative(root, out), `${shown.length} cells`);
