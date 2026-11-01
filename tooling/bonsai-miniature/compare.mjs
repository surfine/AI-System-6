#!/usr/bin/env node
// Before/after board: a crop of the current atlas's own city preview (main)
// beside the new SC2K tier at 64 px per tile, and the miniature tier below. Run after build-sample.mjs.

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ev = (f) => path.join(root, "internal/evidence", f);

const caption = (text, width, height = 44, fill = "#181c24", ink = "#f4f1ea") => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/>`
  + `<text x="16" y="29" font-family="PingFang SC, Helvetica, sans-serif" font-size="20" fill="${ink}">${text}</text></svg>`,
);

const PANEL_W = 900;
const PANEL_H = 620;
const before = await sharp(ev("bonsai-city-preview.png")).extract({ left: 300, top: 150, width: PANEL_W, height: PANEL_H }).png().toBuffer();
const after = await sharp(ev("bonsai-miniature/district-sc2k.png")).resize(PANEL_W, PANEL_H, { kernel: "nearest" }).png().toBuffer();
const mini = await sharp(ev("bonsai-miniature/district-mini.png")).png().toBuffer();
const W = PANEL_W * 2;
const H = 44 + PANEL_H + 44 + 1180;
const board = await sharp({ create: { width: W, height: H, channels: 3, background: "#181c24" } }).composite([
  { input: caption("现状：main 图集构建时生成的城市预览（局部）", PANEL_W), left: 0, top: 0 },
  { input: caption("新 · SC2K 档（每格 64 px，游戏默认缩放下为 32 px）", PANEL_W), left: PANEL_W, top: 0 },
  { input: before, left: 0, top: 44 },
  { input: after, left: PANEL_W, top: 44 },
  { input: caption("新 · 微缩混合档（移轴、软阴影、环境光遮蔽、陶盆）", W), left: 0, top: 44 + PANEL_H },
  { input: mini, left: 0, top: 44 + PANEL_H + 44 },
]).png().toBuffer();
await sharp(board).toFile(ev("bonsai-miniature/before-after.png"));
console.log("before-after.png", W, "x", H);
