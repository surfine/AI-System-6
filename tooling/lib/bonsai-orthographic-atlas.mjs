// Deterministic, dependency-free offline rendering of the runtime geometry.
// No browser, GPU, network or random source participates in atlas generation.
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import vm from "node:vm";
import path from "node:path";

export function decodeRgbaPng(bytes) {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("bonsai-png-signature");
  let width, height, colorType;
  const parts = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9];
      if (data[8] !== 8 || ![2, 6].includes(colorType) || data[12] !== 0) throw new Error("bonsai-png-format");
    }
    if (type === "IDAT") parts.push(data);
    offset += length + 12;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(parts));
  if (raw.length !== (stride + 1) * height) throw new Error("bonsai-png-length");
  const decoded = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error("bonsai-png-filter");
    for (let x = 0; x < stride; x += 1) {
      const i = y * stride + x;
      const a = x >= channels ? decoded[i - channels] : 0;
      const b = y > 0 ? decoded[i - stride] : 0;
      const c = y > 0 && x >= channels ? decoded[i - stride - channels] : 0;
      const delta = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      decoded[i] = (raw[y * (stride + 1) + x + 1] + delta) & 255;
    }
  }
  const pixels = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i += 1) for (let c = 0; c < channels; c += 1) pixels[i * 4 + c] = decoded[i * channels + c];
  return { width, height, pixels };
}

export async function loadOrthographicAtlas(desktopRoot, source) {
  const context = vm.createContext({ window: {}, console });
  vm.runInContext(await readFile(path.join(desktopRoot, "app/features/bonsai-renderer-voxel.js"), "utf8"), context);
  const pure = context.window.AISystem6BonsaiVoxelRenderer.pure;
  const root = path.join(desktopRoot, "assets/bonsai");
  const manifest = JSON.parse(await readFile(path.join(root, "textures.json"), "utf8"));
  const texture = decodeRgbaPng(await readFile(path.join(root, "textures.png")));
  let emission = null;
  const emissionFile = manifest.masks?.file;
  if (emissionFile) emission = decodeRgbaPng(await readFile(path.join(desktopRoot, emissionFile)));
  return createOrthographicRenderer(pure, source, manifest, texture, emission);
}

export function createOrthographicRenderer(pure, source, manifest, texture, emission = null) {
  
  const rotate = ([x, y, z], direction) => {
    for (let i = 0; i < direction; i += 1) [x, z] = [-z, x];
    return [x, y, z];
  };
  const project = ([x, y, z]) => [(x - z) * source.geometry.tileWidth / 2, (x + z) * source.geometry.tileHeight / 2 - y * pure.PX_PER_WORLD_Y, (x + z) * Math.sqrt(3) / 2 + y];
  const sample = (image, rect, u, v) => {
    const x = rect.x + Math.min(rect.w - 1, Math.floor((((u % 1) + 1) % 1) * rect.w));
    const y = rect.y + Math.min(rect.h - 1, Math.floor((((v % 1) + 1) % 1) * rect.h));
    return image.pixels.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4);
  };
  function render(frame, direction, width, height, anchor) {
    const blocks = pure.createAssetBlocks(frame, source);
    if (!blocks) return null;
    const pixels = Buffer.alloc(width * height * 4);
    const depths = new Float64Array(width * height).fill(-Infinity);
    const night = frame.state === "night";
    for (const block of blocks) {
      for (const face of pure.blockFaces(block)) {
        const normal = rotate(face.normal, direction);
        if ((normal[0] + normal[2]) * Math.sqrt(3) / 2 + normal[1] <= 0) continue;
        const points = face.vertices.map((point) => { const p = project(rotate(point, direction)); return [p[0] + anchor.x, p[1] + anchor.y, p[2]]; });
        const material = manifest.materials[block.tile] || manifest.materials[pure.tileMaterialId(block.tile || "")];
        const tile = material && manifest.tiles[material[face.surface || (normal[1] > 0.7 ? "top" : "side")]];
        const tileId = pure.tileMaterialId(block.tile || "");
        const mean = material && !tileId.startsWith("wall.") && tileId !== "facility.school" ? manifest.tiles[material.top]?.meanColor : null;
        const light = 0.75 + Math.max(0, normal[0] * -0.3 + normal[1] * 0.8 + normal[2] * 0.5) * 0.3;
        const uv = face.uv || points.map((_, i) => [[0, 1], [1, 1], [1, 0], [0, 0]][i]);
        for (let tri = 1; tri < points.length - 1; tri += 1) {
          const indices = [0, tri, tri + 1];
          const [a, b, c] = indices.map((i) => points[i]);
          const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
          if (Math.abs(det) < 1e-8) continue;
          const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
          const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
          for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
            const wa = ((b[1] - c[1]) * (x + 0.5 - c[0]) + (c[0] - b[0]) * (y + 0.5 - c[1])) / det;
            const wb = ((c[1] - a[1]) * (x + 0.5 - c[0]) + (a[0] - c[0]) * (y + 0.5 - c[1])) / det;
            const wc = 1 - wa - wb;
            if (Math.min(wa, wb, wc) < -1e-7) continue;
            const depth = wa * a[2] + wb * b[2] + wc * c[2], pixel = y * width + x;
            if (depth <= depths[pixel] + 1e-8) continue;
            depths[pixel] = depth;
            const weights = [wa, wb, wc];
            const u = indices.reduce((v, i, n) => v + uv[i][0] * weights[n], 0);
            const v = indices.reduce((v0, i, n) => v0 + uv[i][1] * weights[n], 0) * (face.surface === "side" ? pure.tileCropFraction(block.tile) : 1);
            const texel = tile ? sample(texture, tile, u, v) : [255, 255, 255, 255];
            const mask = tile && emission ? sample(emission, tile, u, v) : [0,0,0,255];
            const glass = mask[0] / 255;
            const glow = night ? mask[1] / 255 : 0;
            const tint = [block.r, block.g, block.b];
            const windowColor = source.palette[night ? "windowNight" : "glass"];
            for (let channel = 0; channel < 3; channel += 1) {
              const color = tint[channel] * (1-glass) + (windowColor[channel] / 255) * glass;
              const albedo = texel[channel] * (mean ? 255 / Math.max(15, mean[channel]) : 1);
              pixels[pixel * 4 + channel] = Math.max(0, Math.min(255, Math.round(albedo * color * light + glow * windowColor[channel] * .7)));
            }
            // Color alpha is deliberately not interpreted as window emission.
            pixels[pixel * 4 + 3] = Math.round(255 * (block.a ?? 1));
          }
        }
      }
    }
    return pixels;
  }
  const sampleMaterial = (key, surface, u, v) => {
    const material = manifest.materials[key];
    const rect = material && manifest.tiles[material[surface]];
    return rect ? Array.from(sample(texture, rect, u, v)) : null;
  };
  return { render, pure, sampleMaterial };
}
