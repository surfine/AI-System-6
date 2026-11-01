#!/usr/bin/env node
// Read-only generated-art coverage audit. No rebuilds, asset edits or network.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const { createCanvas, loadImage } = createRequire(import.meta.url)("canvas");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (key, fallback) => {
  const index = args.indexOf(key);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${key} requires a value`);
  return args[index + 1];
};
if (args.includes("--help")) {
  console.log("Usage: node tooling/verify-bonsai-remaster-assets.mjs [--root REPOSITORY] [--output DIR]");
  process.exit(0);
}
const repository = resolve(option("--root", root));
const desktop = join(repository, "apps/desktop");
const output = resolve(option("--output", join(root, "dist/bonsai-remaster/assets")));
const hash = (data) => createHash("sha256").update(data).digest("hex");
const failures = [];
const warnings = [];
const files = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const bytes = (file) => readFile(join(desktop, file));
async function json(file) { return JSON.parse(await bytes(file)); }
async function asset(file, expectedSha256 = null) {
  const body = await bytes(file);
  const sha256 = hash(body);
  const record = { file, bytes: body.length, sha256, expectedSha256, hashMatches: expectedSha256 ? sha256 === expectedSha256 : null };
  check(!expectedSha256 || record.hashMatches, `${file}: manifest hash mismatch`);
  files.push(record);
  return { body, record };
}
async function decode(file, expectedSha256) {
  const result = await asset(file, expectedSha256);
  const image = await loadImage(result.body);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  result.record.width = image.width; result.record.height = image.height;
  result.record.decodedRgbaBytes = image.width * image.height * 4;
  canvas.width = 1; canvas.height = 1;
  return { ...result, pixels, width: image.width, height: image.height };
}
function region(image, rect, id) {
  const valid = [rect.x, rect.y, rect.w, rect.h].every(Number.isInteger)
    && rect.w > 0 && rect.h > 0 && rect.x >= 0 && rect.y >= 0
    && rect.x + rect.w <= image.width && rect.y + rect.h <= image.height;
  check(valid, `${id}: invalid image bounds`);
  if (!valid) return null;
  const out = Buffer.alloc(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y += 1) {
    const offset = ((rect.y + y) * image.width + rect.x) * 4;
    out.set(image.pixels.subarray(offset, offset + rect.w * 4), y * rect.w * 4);
  }
  return out;
}
function alphaBounds(pixels, width, height) {
  let minX = width; let minY = height; let maxX = -1; let maxY = -1; let coverage = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!pixels[(y * width + x) * 4 + 3]) continue;
    coverage += 1;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { coveragePixels: coverage, trimBounds: coverage ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null,
    touchesFrameEdge: coverage > 0 && (minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1) };
}
const metadataFile = "assets/bonsai/atlas-metadata.json";
const textureFile = "assets/bonsai/textures.json";
const provenanceFile = "assets/bonsai/provenance.json";
const [metadata, textures, provenance] = await Promise.all([json(metadataFile), json(textureFile), json(provenanceFile)]);
for (const file of [metadataFile, textureFile, provenanceFile]) await asset(file);
for (const [file, global, data] of [["app/generated/bonsai-atlas.js", "AISystem6BonsaiAtlas", metadata], ["app/generated/bonsai-textures.js", "AISystem6BonsaiTextures", textures]]) {
  const runtime = await asset(file);
  const context = vm.createContext({ window: {} });
  vm.runInContext(runtime.body.toString("utf8"), context, { timeout: 5000 });
  check(JSON.stringify(context.window[global]) === JSON.stringify(data), `${file}: runtime/JSON manifest disagreement`);
}
const frames = Object.entries(metadata.frames).map(([id, frame]) => ({ id, category: frame.category, state: frame.state, stage: frame.stage,
  variant: frame.variant, animation: frame.animation, footprint: frame.footprint, atlasRect: { x: frame.x, y: frame.y, w: frame.w, h: frame.h }, anchor: frame.anchor, directions: {} }));
check(frames.length === 752, `Expected 752 frame identities, found ${frames.length}`);
const directionNames = ["north", "east", "south", "west"];
for (const direction of directionNames) {
  const entry = metadata.directions[direction];
  const image = await decode(entry.file, entry.sha256);
  check(image.width === metadata.atlas.width && image.height === metadata.atlas.height, `${direction}: dimensions disagree with manifest`);
  const provenanceEntry = provenance.files.find((file) => file.file === entry.file);
  check(provenanceEntry?.sha256 === entry.sha256, `${direction}: provenance/atlas hash disagreement`);
  for (const frame of frames) {
    const pixels = region(image, frame.atlasRect, `${frame.id}/${direction}`);
    if (!pixels) continue;
    const coverage = alphaBounds(pixels, frame.atlasRect.w, frame.atlasRect.h);
    frame.directions[direction] = { sha256: hash(pixels), ...coverage };
    check(coverage.coveragePixels > 0, `${frame.id}/${direction}: empty frame`);
    check(!coverage.touchesFrameEdge, `${frame.id}/${direction}: visible pixels touch frame boundary`);
  }
}
const color = await decode(textures.png.file, textures.png.sha256);
const mask = await decode(textures.masks.file, textures.masks.sha256);
check(color.width === textures.atlas.width && color.height === textures.atlas.height, "Colour atlas dimensions disagree with manifest");
check(color.width === mask.width && color.height === mask.height, "Colour/mask dimensions disagree");
const sourceArt = await decode(textures.artwork.file, textures.artwork.sha256);
check(provenance.sourceArtwork?.sha256 === sourceArt.record.sha256, "Source artwork provenance hash disagreement");
const promptFile = textures.artwork.promptFile || provenance.sourceArtwork.prompt;
const expectedPromptHash = textures.artwork.promptSha256 || provenance.sourceArtwork.promptSha256 || null;
const prompt = await asset(promptFile, expectedPromptHash);
check(prompt.body.toString("utf8").trim().length > 0, "Source artwork prompt is empty");
if (!expectedPromptHash) warnings.push("Prompt SHA-256 is computed in this audit; source manifests do not pin an expected prompt hash.");
const tiles = [];
for (const [id, rect] of Object.entries(textures.tiles)) {
  const pixels = region(color, rect, id);
  const maskPixels = region(mask, rect, `${id}/mask`);
  const cell = textures.artwork.assignments[id];
  check(Number.isInteger(cell) && cell >= 0 && cell < 16, `${id}: missing source-art cell assignment`);
  if (!pixels || !maskPixels) continue;
  let glassPixels = 0; let emissionPixels = 0; let transparentPixels = 0; let invalidMaskPixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] < 255) transparentPixels += 1;
    if (maskPixels[offset]) glassPixels += 1;
    if (maskPixels[offset + 1]) emissionPixels += 1;
    if (maskPixels[offset + 1] > maskPixels[offset] || maskPixels[offset + 2] !== 0 || maskPixels[offset + 3] !== 255) invalidMaskPixels += 1;
  }
  check(transparentPixels === 0, `${id}: colour alpha is not opaque`);
  check(invalidMaskPixels === 0, `${id}: invalid material-mask data`);
  const column = cell % 4; const row = Math.floor(cell / 4);
  const x0 = Math.floor(column * sourceArt.width / 4) + 2;
  const y0 = Math.floor(row * sourceArt.height / 4) + 2;
  tiles.push({ id, rect, sourceArtwork: { file: textures.artwork.file, sha256: sourceArt.record.sha256, cell,
    crop: { x: x0, y: y0, w: Math.floor((column + 1) * sourceArt.width / 4) - x0 - 2, h: Math.floor((row + 1) * sourceArt.height / 4) - y0 - 2 } },
    colorSha256: hash(pixels), maskSha256: hash(maskPixels), maskChannels: textures.masks.channels, glassPixels, emissionPixels, transparentPixels });
}
check(tiles.length === 48, `Expected 48 texture tiles, found ${tiles.length}`);
for (const [id, material] of Object.entries(textures.materials)) for (const face of [material.top, material.side]) check(Boolean(textures.tiles[face]), `${id}: unresolved face ${face}`);
const runtimeFiles = files.filter((file) => /(?:atlas-(north|east|south|west)|textures|texture-masks)\.png$/.test(file.file));
const report = { schema: "bonsai-remaster-assets-audit-v1", passed: failures.length === 0,
  counts: { frameIdentities: frames.length, frameDirectionImages: frames.length * directionNames.length, textureTiles: tiles.length },
  geometry: metadata.geometry, packing: metadata.atlas, sourceArtwork: { ...textures.artwork, promptSha256: prompt.record.sha256, promptHashPinned: Boolean(expectedPromptHash) },
  memory: { runtimePngFileBytes: runtimeFiles.reduce((sum, file) => sum + file.bytes, 0), decodedRuntimeRgbaBytes: runtimeFiles.reduce((sum, file) => sum + file.decodedRgbaBytes, 0),
    note: "Nominal width × height × 4 decoded RGBA bytes for four direction atlases plus colour and mask; excludes GPU overhead, caches and authoring source art. No budget is inferred." },
  files, frames, tiles, failures, warnings };
await mkdir(output, { recursive: true });
async function atomic(name, content) { const target = join(output, name); await writeFile(`${target}.tmp`, content); await rename(`${target}.tmp`, target); }
await atomic("assets.json", `${JSON.stringify(report, null, 2)}\n`);
const lines = ["# Bonsai City 素材覆盖审计", "", `结果：${report.passed ? "通过" : "失败"}；${frames.length} 帧身份 × 4 方向，${tiles.length} 张材质纹理。`, "", "此报告验证文件、像素覆盖和来源一致性，不代表浏览器视觉验收。", "",
  `运行时 PNG：${report.memory.runtimePngFileBytes} 字节；标称解码 RGBA：${report.memory.decodedRuntimeRgbaBytes} 字节。未假设预算。`, "",
  `原稿 SHA-256：${sourceArt.record.sha256}`, "", `提示词 SHA-256：${prompt.record.sha256}；来源清单预先固定：${Boolean(expectedPromptHash)}。`, "",
  "完整 SHA、四方向 trim bounds、逐文件体积与错误详情见 [assets.json](assets.json)。下表 SHA 为前 12 位。", "", "## 四方向精灵", "",
  "| 帧 | 类别 / 状态 | 占地 | 打包尺寸 | 北 / 东 / 南 / 西像素 SHA |", "| --- | --- | --- | --- | --- |"];
for (const frame of frames) lines.push(`| ${frame.id} | ${frame.category} / ${frame.state} | ${frame.footprint.w}×${frame.footprint.h} | ${frame.atlasRect.w}×${frame.atlasRect.h} | ${directionNames.map((name) => frame.directions[name]?.sha256.slice(0, 12) || "缺失").join(" / ")} |`);
lines.push("", "## 材质", "", "| 纹理 | 原稿格 | 颜色 SHA | 遮罩 SHA | 玻璃 / 发光像素 |", "| --- | --- | --- | --- | --- |");
for (const tile of tiles) lines.push(`| ${tile.id} | ${tile.sourceArtwork.cell} | ${tile.colorSha256.slice(0, 12)} | ${tile.maskSha256.slice(0, 12)} | ${tile.glassPixels} / ${tile.emissionPixels} |`);
if (warnings.length) lines.push("", "## 记录限制", "", ...warnings.map((message) => `- ${message}`));
if (failures.length) lines.push("", "## 失败", "", ...failures.map((message) => `- ${message}`));
await atomic("assets.md", `${lines.join("\n")}\n`);
console.log(`${report.passed ? "PASS" : "FAIL"}: ${frames.length} frames × 4; ${tiles.length} tiles; ${failures.length} failures; ${warnings.length} notices. ${join(output, "assets.json")}`);
if (!report.passed) process.exitCode = 1;
